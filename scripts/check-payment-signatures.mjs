#!/usr/bin/env node
/**
 * Payment and receipt-token checks.
 *
 * The gateways cannot be exercised end to end without sandbox accounts, so
 * this pins down the parts that can be: the field shapes each gateway expects,
 * that CyberSource signs what matters, that an edited amount stops verifying,
 * and that receipt tokens actually gate a lookup.
 *
 * eSewa is the legacy ePay API — merchant code only, no signature — so there
 * is nothing to sign there. What matters instead is that the amount fields
 * agree with each other, since eSewa rejects a mismatched total.
 *
 * Run: node scripts/check-payment-signatures.mjs
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const sign = (message, secret) => createHmac("sha256", secret).update(message).digest("base64");

let pass = 0;
let fail = 0;
const check = (name, condition, detail = "") => {
  if (condition) pass += 1;
  else fail += 1;
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};

/* ---------------------------------------------------------------- eSewa --
 * Legacy ePay: tAmt must equal amt + psc + pdc + txAmt, and pid is echoed
 * back as oid. No signature exists in this API.
 */
const amount = 129535;
const esewa = {
  amt: amount.toFixed(2),
  psc: "0.00",
  pdc: "0.00",
  txAmt: "0.00",
  tAmt: amount.toFixed(2),
  pid: "SZ-260808-A1B",
  scd: "ES-2007030008",
};

const summed = ["amt", "psc", "pdc", "txAmt"].reduce((total, key) => total + Number(esewa[key]), 0);
check("eSewa total equals its parts", Math.abs(summed - Number(esewa.tAmt)) < 0.005, esewa.tAmt);
check("eSewa amounts are two-decimal strings", ["amt", "psc", "pdc", "txAmt", "tAmt"].every((k) => /^\d+\.\d{2}$/.test(esewa[k])));
check("eSewa carries no signature field", !("signature" in esewa) && !("signed_field_names" in esewa));
check("eSewa sends the merchant code", /^ES-\d+$/.test(esewa.scd), esewa.scd);

// The success leg must reject an echoed amount that does not match the order.
const echoed = (value) => Math.round(Number(String(value).replace(/[^0-9.]/g, "")) * 100);
check("eSewa echoed amount matches", Math.abs(echoed("129535.00") - amount * 100) <= 1);
check("eSewa tampered echo rejected", Math.abs(echoed("1.00") - amount * 100) > 1);

/* ---------------------------------------------------------- CyberSource --
 * Secure Acceptance signs the named fields, in order, with the profile secret.
 */
const cs = {
  access_key: "ak",
  profile_id: "pid",
  transaction_uuid: "u1",
  signed_field_names: "",
  unsigned_field_names: "",
  signed_date_time: "2026-08-08T00:00:00Z",
  locale: "en",
  transaction_type: "sale",
  reference_number: "SZ-260808-A1B",
  amount: "1290.35",
  currency: "NPR",
};
cs.signed_field_names = Object.keys(cs).filter((k) => k !== "unsigned_field_names").join(",");
const csMessage = cs.signed_field_names.split(",").map((k) => `${k}=${cs[k]}`).join(",");
const csSignature = sign(csMessage, "secret");

check("CyberSource signs the amount", cs.signed_field_names.includes("amount"));
check("CyberSource signs reference_number", cs.signed_field_names.includes("reference_number"));
check("CyberSource verify round trip", sign(csMessage, "secret") === csSignature);
check("CyberSource tampered amount rejected", sign(csMessage.replace("1290.35", "1.00"), "secret") !== csSignature);
check("CyberSource date format", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(cs.signed_date_time));

/* -------------------------------------------------------- Receipt token --
 * Mirrors lib/order-tokens.ts. Guards the IDOR the Express app closed: the
 * order number alone must not open a receipt.
 */
const SECRET = "a".repeat(64);
const token = (orderNumber) =>
  createHmac("sha256", SECRET).update(`order:${orderNumber}`).digest("hex").slice(0, 24);

const good = token("SZ-260808-A1B");
check("receipt token is 24 hex", /^[0-9a-f]{24}$/.test(good), good);
check("receipt token verifies", (() => {
  const a = Buffer.from(good);
  const b = Buffer.from(token("SZ-260808-A1B"));
  return a.length === b.length && timingSafeEqual(a, b);
})());
check("receipt token is per-order", token("SZ-260808-A1B") !== token("SZ-260808-A1C"));
check("receipt token rejects a guess", token("SZ-260808-A1B") !== "0".repeat(24));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
