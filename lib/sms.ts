import "server-only";

import { normalisePhone } from "./order-lookup";

/**
 * SMS, via Aakash SMS v3 — the gateway the Express storefront already uses.
 *
 * Ported rather than replaced so sign-in keeps working against the same account
 * and the same sender ID. Set `AAKASH_SMS_TOKEN` to enable it.
 */

const ENDPOINT = "https://sms.aakashsms.com/sms/v3/send/";
const TIMEOUT_MS = 7_000;

export type SmsResult =
  | { ok: true }
  | { ok: false; reason: "unconfigured" | "rejected" | "timeout" | "network" };

export function isSmsConfigured(): boolean {
  return Boolean(process.env.AAKASH_SMS_TOKEN?.trim());
}

/**
 * Send one message. Never throws.
 *
 * Two things about this gateway are easy to get wrong:
 *
 *   1. **Success is in the body, not the status.** Aakash answers HTTP 200 with
 *      `{"error": true, "message": "Not enough balance."}` when it has not sent
 *      anything. Trusting `res.ok` means a shop with an empty balance believes
 *      every code went out.
 *   2. **It rejects the country code.** The recipient must be the bare local
 *      ten digits, which `normalisePhone` already produces.
 *
 * One attempt, hard timeout, no retry: the caller is a customer waiting on a
 * sign-in screen, and a slow second attempt is worse than a fast failure.
 */
export async function sendSms(to: string, text: string): Promise<SmsResult> {
  const token = process.env.AAKASH_SMS_TOKEN?.trim();
  if (!token) return { ok: false, reason: "unconfigured" };

  const recipient = normalisePhone(to);
  if (recipient.length !== 10) return { ok: false, reason: "rejected" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ auth_token: token, to: recipient, text }),
      signal: controller.signal,
      cache: "no-store",
    });

    const body = (await response.json().catch(() => null)) as { error?: unknown } | null;

    // `error: false` is the only success. See note 1 above.
    if (body && body.error === false) return { ok: true };

    // Deliberately not logging the body: it echoes the message, and for a
    // sign-in that message contains the code.
    console.error(`[sms] gateway rejected the send (HTTP ${response.status})`);
    return { ok: false, reason: "rejected" };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    console.error(`[sms] ${aborted ? "timed out" : "network error"}`);
    return { ok: false, reason: aborted ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The sign-in message.
 *
 * The reference logs this line, code included, whenever the gateway is
 * unconfigured — and unconfigured is its shipped default. Nothing here ever
 * prints a code: an OTP in a log file is an OTP anyone with log access can use.
 */
export async function sendOtpSms(phone: string, code: string): Promise<SmsResult> {
  return sendSms(
    phone,
    `${code} is your Sazuna verification code. It expires shortly — do not share it with anyone.`,
  );
}
