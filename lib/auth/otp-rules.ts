import { createHash, randomInt, timingSafeEqual } from "node:crypto";

/**
 * One-time code rules — the parts with no database in them.
 *
 * Split out from lib/auth/otp.ts for the same reason lib/order-lookup.ts is
 * split from lib/orders.ts: this is an authentication boundary, it cannot be
 * exercised end to end without a live handset and an SMS balance, so the rules
 * that matter are kept pure and asserted directly by
 * scripts/check-auth.mts on every commit.
 *
 * Values are the reference app's, which are sane: six digits, five minutes,
 * five attempts, a sixty-second resend cooldown and six sends an hour. The
 * arithmetic is worth stating plainly — a six-digit code is only ~20 bits, so
 * it is the attempt cap and the TTL doing the work, not the code's entropy.
 * That is precisely why the attempt cap has to be enforced atomically; see
 * consumeAttemptSql below.
 */

export const OTP_LENGTH = 6;
export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const OTP_MAX_SENDS_PER_HOUR = 6;

/**
 * A numeric code with leading zeros preserved.
 *
 * `randomInt` is the CSPRNG with rejection sampling, not `Math.random`, and
 * drawing from `[0, 1e9)` zero-padded to nine digits keeps every digit
 * uniform — taking a modulus of a smaller range would bias the low digits.
 */
export function generateCode(length: number = OTP_LENGTH): string {
  let out = "";
  while (out.length < length) {
    out += randomInt(0, 1_000_000_000).toString().padStart(9, "0");
  }
  return out.slice(0, length);
}

/** Hex SHA-256. The plaintext code is never stored, logged or returned. */
export function hashCode(code: string): string {
  return createHash("sha256").update(String(code)).digest("hex");
}

/** Strip anything a customer might paste around the digits. */
export function normaliseCode(raw: unknown): string {
  return String(raw ?? "").replace(/[^0-9]/g, "");
}

/**
 * Constant-time comparison of two hex digests.
 *
 * The length guard is not decoration: `timingSafeEqual` throws on a length
 * mismatch, and a throw here would be a timing signal of its own.
 */
export function codeMatches(code: string, storedHash: string): boolean {
  const a = Buffer.from(hashCode(code));
  const b = Buffer.from(String(storedHash ?? ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Issue a code only if the number is under its hourly cap AND past the resend
 * cooldown — as one statement.
 *
 * Checking the cap and then inserting leaves a window where two concurrent
 * requests both pass the check. Folding both conditions into the INSERT's own
 * WHERE closes it: the database decides, once. `affectedRows === 0` means
 * throttled, and the previous code is still live.
 *
 * Parameter order: phone, codeHash, maxAttempts, ttlSeconds, phone,
 * maxSendsPerHour, phone, cooldownSeconds.
 */
export const issueCodeSql = `
  INSERT INTO customer_otp (phone, code_hash, attempts, max_attempts, expires_at)
  SELECT ?, ?, 0, ?, (NOW() + INTERVAL ? SECOND) FROM DUAL
   WHERE (SELECT COUNT(*) FROM customer_otp
           WHERE phone = ? AND created_at > (NOW() - INTERVAL 1 HOUR)) < ?
     AND NOT EXISTS (SELECT 1 FROM customer_otp
                      WHERE phone = ? AND created_at > (NOW() - INTERVAL ? SECOND))`;

/**
 * Count a failed guess and burn the code if that was the last one — atomically.
 *
 * THIS IS THE FIX. The reference reads `row.attempts` into JavaScript, adds
 * one, and writes the absolute value back (portal-otp.js:104-110). Concurrent
 * guesses therefore all read 0 and all write 1, the `>= max_attempts` branch
 * never fires, and the five-attempt cap silently becomes unlimited — leaving a
 * 10^6 space brute-forceable inside the five-minute window with only a per-IP
 * limiter in the way. It is confirmed finding #6 in that app's own audit.
 *
 * Incrementing in SQL and deciding the consume in the same statement means the
 * database serialises it and the cap holds no matter how many requests arrive
 * at once.
 *
 * ORDER OF THE SET CLAUSES IS LOAD-BEARING. MySQL evaluates them left to right
 * and a later expression sees the *new* value of a column already assigned. Put
 * `attempts = attempts + 1` first and the `IF` then reads the incremented
 * value, testing `attempts + 2 >= max_attempts` — which burns the code one
 * guess early, giving the customer four tries out of five. Assigning
 * `consumed_at` first keeps it reading the pre-increment value. (The fix
 * suggested in the reference app's own audit has this bug.)
 *
 * `AND consumed_at IS NULL` is what stops the counter running away: guesses
 * still in flight when the code burns match nothing and change nothing.
 */
export const consumeAttemptSql = `
  UPDATE customer_otp
     SET consumed_at = IF(attempts + 1 >= max_attempts, NOW(), consumed_at),
         attempts = attempts + 1
   WHERE id = ? AND consumed_at IS NULL`;

/** Whether that increment was the one that exhausted the allowance. */
export function isLockedOut(attemptsAfter: number, maxAttempts: number): boolean {
  return attemptsAfter >= maxAttempts;
}

/**
 * What a sign-in attempt produced.
 *
 * `unknown-code` covers expired, already-used and never-existed alike — the
 * caller must not tell them apart, or the endpoint becomes an oracle for which
 * numbers have a live code outstanding.
 */
export type VerifyOutcome = "ok" | "wrong-code" | "unknown-code" | "locked-out";
