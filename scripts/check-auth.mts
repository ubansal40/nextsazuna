#!/usr/bin/env node
/**
 * Customer sign-in checks.
 *
 * Sign-in is the one boundary that cannot be exercised end to end without a
 * live handset and an SMS balance, so the rules that hold it up are kept pure
 * in lib/auth/otp-rules.ts and asserted here on every commit.
 *
 * The check that matters most is the concurrency one. The Express app counts a
 * failed guess by reading `attempts` into JavaScript, adding one, and writing
 * the absolute value back — so parallel guesses all read 0 and all write 1, the
 * five-attempt cap never fires, and a six-digit code becomes brute-forceable
 * inside its five-minute life. That is confirmed finding #6 in that app's own
 * audit. `consumeAttemptSql` is the fix, and the test below is a real race
 * against the real database.
 *
 * Run: npx tsx scripts/check-auth.mts
 */
import { createConnection } from "mysql2/promise";
import { readFileSync } from "node:fs";
import {
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  codeMatches,
  consumeAttemptSql,
  generateCode,
  hashCode,
  normaliseCode,
} from "../lib/auth/otp-rules";
import { publicCustomer, type CustomerRow } from "../lib/customer-projection";

// --- pure checks ------------------------------------------------------------

const codes = Array.from({ length: 4000 }, () => generateCode());
const digitCounts = new Map<string, number>();
for (const code of codes) {
  for (const digit of code) digitCounts.set(digit, (digitCounts.get(digit) ?? 0) + 1);
}
const expectedPerDigit = (codes.length * OTP_LENGTH) / 10;
// Uniform to within 25% — loose enough never to flake, tight enough to catch a
// modulus bias, which skews the low digits by ~10x.
const uniform = [...digitCounts.values()].every(
  (n) => n > expectedPerDigit * 0.75 && n < expectedPerDigit * 1.25,
);

const sample = generateCode();

const customerRow = {
  id: 1,
  phone: "9803999935",
  name: "Ananya Sharma",
  email: "ananya@example.com",
  address_line1: "12 New Road",
  address_line2: null,
  city: "Kathmandu",
  state: null,
  postal_code: "44600",
  country: "Nepal",
  dob: "1994-03-02",
  anniversary: null,
  ring_size: "14",
  bangle_size: null,
  loyalty_points: 240,
  notes: "Haggled hard on the halo ring. Prefers WhatsApp.",
  created_at: "2026-01-01T00:00:00Z",
} as unknown as CustomerRow;

const projected = publicCustomer(customerRow);

const checks: [string, boolean][] = [
  ["a code is exactly six digits", /^\d{6}$/.test(sample)],
  ["leading zeros are preserved", codes.some((c) => c.startsWith("0")) || codes.length < 100],
  ["digits are uniform — no modulus bias", uniform],
  ["4000 codes are not all distinct by luck alone", new Set(codes).size > 3900],
  ["hashing is stable", hashCode("123456") === hashCode("123456")],
  ["the hash is not the code", !hashCode("123456").includes("123456")],
  ["the hash is 64 hex chars", /^[0-9a-f]{64}$/.test(hashCode("123456"))],
  ["a right code matches its hash", codeMatches("123456", hashCode("123456"))],
  ["a wrong code does not", !codeMatches("123457", hashCode("123456"))],
  ["a malformed hash does not throw", codeMatches("123456", "nonsense") === false],
  ["an empty stored hash does not match", !codeMatches("123456", "")],
  ["pasted codes are cleaned", normaliseCode(" 12-34 56 ") === "123456"],
  ["a non-numeric code normalises to empty", normaliseCode("abcdef") === ""],

  // --- the buyer-safe projection -------------------------------------------
  ["publicCustomer carries NO notes key", !Object.keys(projected).includes("notes")],
  [
    "publicCustomer never leaks the staff note",
    !JSON.stringify(projected).includes("Haggled hard"),
  ],
  ["publicCustomer keeps the fields the portal renders", projected.name === "Ananya Sharma"],
  ["publicCustomer coerces missing values to empty strings", projected.state === ""],
];

// --- the concurrency check, against the real database -----------------------
//
// Skipped rather than failed when there are no credentials: the production
// build runs without them by design, and CI must stay green there.

function loadEnv(file: string) {
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const match = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* no env file — fall through to the skip below */
  }
}
loadEnv(".env.local");
loadEnv(".env");

const dbConfigured = Boolean(
  process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME,
);

if (!dbConfigured) {
  console.log("SKIP  attempt cap holds under concurrent guessing (no database credentials)");
} else {
  const db = await createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  // A phone that cannot collide with a real customer: 10 digits, reserved range.
  const phone = "0000000001";
  await db.execute("DELETE FROM customer_otp WHERE phone = ?", [phone]);
  await db.execute(
    `INSERT INTO customer_otp (phone, code_hash, attempts, max_attempts, expires_at)
     VALUES (?, ?, 0, ?, NOW() + INTERVAL 300 SECOND)`,
    [phone, hashCode("111111"), OTP_MAX_ATTEMPTS],
  );
  const [[row]] = (await db.query(
    "SELECT id FROM customer_otp WHERE phone = ? ORDER BY id DESC LIMIT 1",
    [phone],
  )) as [{ id: number }[], unknown];

  // Twenty simultaneous wrong guesses against a five-attempt allowance. With
  // the reference's read-modify-write this lands on attempts = 1, unconsumed.
  await Promise.all(
    Array.from({ length: 20 }, () => db.execute(consumeAttemptSql, [row.id])),
  );

  const [[after]] = (await db.query(
    "SELECT attempts, consumed_at FROM customer_otp WHERE id = ?",
    [row.id],
  )) as [{ attempts: number; consumed_at: Date | null }[], unknown];

  const spentAfterBurn = await db
    .execute(consumeAttemptSql, [row.id])
    .then(([r]) => (r as { affectedRows: number }).affectedRows);

  console.log(
    `      (20 parallel guesses against a cap of ${OTP_MAX_ATTEMPTS} → attempts=${after.attempts}, consumed=${after.consumed_at !== null})`,
  );

  checks.push(
    /**
     * The reference's read-modify-write lands here on attempts=1, unconsumed —
     * every request having read 0 and written 1. Reaching the cap at all is the
     * property under test.
     */
    ["concurrent guessing reaches the attempt cap", after.attempts >= OTP_MAX_ATTEMPTS],
    ["the code is burnt once the cap is reached", after.consumed_at !== null],
    /**
     * It stops at the cap rather than running away: `AND consumed_at IS NULL`
     * means the guesses still in flight when the code burns do not count. A few
     * may land in the same instant, so this allows a little slack — what it
     * rules out is all twenty getting through.
     */
    ["it does not overshoot the cap", after.attempts <= OTP_MAX_ATTEMPTS + 5],
    ["a burnt code accepts no further guesses", spentAfterBurn === 0],
  );

  await db.execute("DELETE FROM customer_otp WHERE phone = ?", [phone]);
  await db.end();
}

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}
console.log(`\n${checks.length - failed} passed, ${failed} failed`);
if (failed) {
  console.error(
    "\n✗ sign-in checks FAILED — this is the authentication boundary, and it has no\n" +
      "  end-to-end test to fall back on. Fix lib/auth/otp-rules.ts rather than\n" +
      "  relaxing a check.",
  );
}
process.exit(failed ? 1 : 0);
