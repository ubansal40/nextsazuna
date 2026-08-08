import "server-only";

import type { RowDataPacket } from "mysql2";
import { execute, queryOne } from "../db";
import { findCustomerByPhone } from "../customers";
import type { CustomerRow } from "../customer-projection";
import { normalisePhone } from "../order-lookup";
import { isSmsConfigured, sendOtpSms } from "../sms";
import {
  OTP_MAX_ATTEMPTS,
  OTP_MAX_SENDS_PER_HOUR,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_SECONDS,
  codeMatches,
  consumeAttemptSql,
  devCodeAllowed,
  generateCode,
  hashCode,
  isLockedOut,
  issueCodeSql,
  normaliseCode,
  type VerifyOutcome,
} from "./otp-rules";

/**
 * One-time code issuance and verification.
 *
 * Sign-in is phone-only. `customer_otp` has no email column, `customers.email`
 * is nullable and not unique, and the header panel's field is already a tel
 * input — the Express app deviated from its own design spec for exactly this
 * reason, noting an email typed there could never receive a code.
 *
 * There is no self-registration: a code is only ever issued to a number that
 * already has a customer record, and one exists because an order created it.
 */

interface OtpRow extends RowDataPacket {
  id: number;
  code_hash: string;
  attempts: number;
  max_attempts: number;
}

/**
 * Ask for a code.
 *
 * **The answer is deliberately the same whether or not the number has an
 * account.** The reference returns a 404 with distinct copy when it doesn't,
 * which makes the endpoint a clean "is this number a Sazuna customer" oracle —
 * for a jeweller that is a disclosure about what someone has bought. (Its own
 * module header claims the opposite of what the code does; the comment is
 * wrong, not the code.) The panel says "if that number has an account, your
 * code is on its way", which is true either way.
 *
 * Returns `throttled` only for the cooldown and the hourly cap, which the
 * caller may safely surface: it says nothing about whether the account exists.
 */
export type RequestCodeOutcome = "sent" | "throttled" | "undeliverable";

export interface RequestCodeResult {
  outcome: RequestCodeOutcome;
  /**
   * The code itself, and **only** on a developer's machine with no SMS gateway
   * configured.
   *
   * Without this there is no way to sign in locally without buying SMS credit,
   * which means the flow never gets exercised until it is in front of a
   * customer. `devCodeAllowed` is the whole gate and is asserted by
   * scripts/check-auth.mts; the reference app gates its equivalent the same way
   * — it is that app's *SMS logger* that prints codes ungated, not this.
   */
  devCode?: string;
}

export async function requestCode(rawPhone: string): Promise<RequestCodeResult> {
  const phone = normalisePhone(rawPhone);
  if (phone.length !== 10) return { outcome: "undeliverable" };

  const customer = await findCustomerByPhone(phone);

  /**
   * No account: stop here, but answer exactly as a successful send does. The
   * work skipped is invisible from outside, and timing is not a useful signal
   * when the alternative path is dominated by an SMS round trip anyway.
   */
  if (!customer) return { outcome: "sent" };

  const code = generateCode();

  const issued = await execute(issueCodeSql, [
    phone,
    hashCode(code),
    OTP_MAX_ATTEMPTS,
    OTP_TTL_SECONDS,
    phone,
    OTP_MAX_SENDS_PER_HOUR,
    phone,
    OTP_RESEND_COOLDOWN_SECONDS,
  ]);

  // Nothing inserted: inside the cooldown or over the hourly cap. The previous
  // code is still live, so the customer can carry on and type it.
  if (!issued.affectedRows) return { outcome: "throttled" };

  const otpId = issued.insertId;

  // Only the newest code should be usable. Retiring the rest means a customer
  // who requested twice cannot be confused about which one works, and an old
  // code cannot be replayed after a resend.
  await execute(
    "UPDATE customer_otp SET consumed_at = NOW() WHERE phone = ? AND consumed_at IS NULL AND id <> ?",
    [phone, otpId],
  );

  // Local development with no gateway: hand the code back instead of sending
  // it. See devCodeAllowed — this cannot fire in production.
  if (devCodeAllowed(isSmsConfigured())) return { outcome: "sent", devCode: code };

  /**
   * Awaited, unlike the reference's fire-and-forget send.
   *
   * There, a gateway outage or an empty balance still answered "code sent" and
   * still burned one of six hourly sends — the customer waits for a message
   * that was never delivered, and after six tries is locked out for an hour by
   * failures they were never told about. Here a failed send releases the row,
   * so the attempt costs nothing and the customer is told to try another way.
   */
  const sent = await sendOtpSms(phone, code);
  if (!sent.ok) {
    await execute("UPDATE customer_otp SET consumed_at = NOW() WHERE id = ?", [otpId]);
    return { outcome: "undeliverable" };
  }

  return { outcome: "sent" };
}

export interface VerifyResult {
  outcome: VerifyOutcome;
  /** Present only when `outcome` is "ok". */
  customer?: CustomerRow;
}

/**
 * Check a code and, if it is right, hand back the customer it belongs to.
 *
 * A correct code is not on its own a session: the customer row is re-read
 * afterwards, so a code cannot outlive the account it was issued for.
 */
export async function verifyCode(rawPhone: string, rawCode: string): Promise<VerifyResult> {
  const phone = normalisePhone(rawPhone);
  const code = normaliseCode(rawCode);
  if (phone.length !== 10 || !code) return { outcome: "unknown-code" };

  const row = await queryOne<OtpRow>(
    `SELECT id, code_hash, attempts, max_attempts
       FROM customer_otp
      WHERE phone = ? AND consumed_at IS NULL AND expires_at > NOW()
      ORDER BY id DESC LIMIT 1`,
    [phone],
  );

  // Expired, already used, or never issued — one answer for all three.
  if (!row) return { outcome: "unknown-code" };

  if (!codeMatches(code, row.code_hash)) {
    /**
     * Count the failure in SQL, and let the same statement decide whether that
     * was the last allowed guess. See consumeAttemptSql — doing this as a
     * read-modify-write in JavaScript is what lets concurrent guessing walk
     * straight past the five-attempt cap.
     */
    const result = await execute(consumeAttemptSql, [row.id]);
    if (!result.affectedRows) return { outcome: "unknown-code" };

    // Re-read rather than trusting the value we selected before the increment.
    const after = await queryOne<OtpRow>(
      "SELECT id, code_hash, attempts, max_attempts FROM customer_otp WHERE id = ?",
      [row.id],
    );
    const locked = after ? isLockedOut(after.attempts, after.max_attempts) : true;
    return { outcome: locked ? "locked-out" : "wrong-code" };
  }

  // Right code. Burn it before doing anything else, and only if it is still
  // unburnt — two requests racing with the same correct code must not both win.
  const consumed = await execute(
    "UPDATE customer_otp SET consumed_at = NOW() WHERE id = ? AND consumed_at IS NULL",
    [row.id],
  );
  if (!consumed.affectedRows) return { outcome: "unknown-code" };

  const customer = await findCustomerByPhone(phone);
  if (!customer) return { outcome: "unknown-code" };

  return { outcome: "ok", customer };
}

/** Housekeeping. The day of grace keeps the hourly-cap count meaningful. */
export async function purgeExpiredCodes(): Promise<void> {
  try {
    await execute("DELETE FROM customer_otp WHERE expires_at < (NOW() - INTERVAL 1 DAY)");
  } catch (error) {
    console.error("[otp] purge failed", error);
  }
}
