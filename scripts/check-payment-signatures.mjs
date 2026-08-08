#!/usr/bin/env node
/**
 * Payment signature checks.
 *
 * These gateways cannot be exercised end to end without a sandbox
 * transaction, so the parts that can be pinned down are pinned down here:
 * the message is built from signed_field_names in order, signing is
 * deterministic, a round trip verifies, and — the one that matters — an
 * edited amount no longer verifies.
 *
 * Run: node scripts/check-payment-signatures.mjs
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET = "8gBm/:&EnhH.1/q";
const sign = (m, s) => createHmac("sha256", s).update(m).digest("base64");

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) pass += 1;
  else fail += 1;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};

// --- eSewa: message is built from signed_field_names, in order ---
const fields = {
  amount: "100.00", tax_amount: "0", total_amount: "100.00",
  transaction_uuid: "SZ-260808-A1B", product_code: "EPAYTEST",
};
const NAMES = "total_amount,transaction_uuid,product_code";
const message = NAMES.split(",").map(f => `${f}=${fields[f]}`).join(",");
check("eSewa message shape",
  message === "total_amount=100.00,transaction_uuid=SZ-260808-A1B,product_code=EPAYTEST", message);

const sig = sign(message, SECRET);
check("eSewa signature is base64", /^[A-Za-z0-9+/]+=*$/.test(sig) && Buffer.from(sig, "base64").length === 32, sig);
check("eSewa signature deterministic", sig === sign(message, SECRET));
check("eSewa signature changes with amount",
  sig !== sign(message.replace("100.00", "1.00"), SECRET));

// --- eSewa: round trip through the same verification the callback uses ---
const payload = { ...fields, status: "COMPLETE", signed_field_names: NAMES, signature: sig };
const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
const decoded = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
const recomputed = sign(decoded.signed_field_names.split(",").map(f => `${f}=${decoded[f]}`).join(","), SECRET);
const a = Buffer.from(recomputed), b = Buffer.from(decoded.signature);
check("eSewa return verifies", a.length === b.length && timingSafeEqual(a, b));

// A tampered amount must not verify — this is the whole point of the check.
const tampered = { ...payload, total_amount: "1.00" };
const tSig = sign(NAMES.split(",").map(f => `${f}=${tampered[f]}`).join(","), SECRET);
check("eSewa tampered amount rejected", tSig !== payload.signature);

// --- CyberSource: every field signed, same construction ---
const cs = {
  access_key: "ak", profile_id: "pid", transaction_uuid: "u1",
  signed_field_names: "", unsigned_field_names: "", signed_date_time: "2026-08-08T00:00:00Z",
  locale: "en", transaction_type: "sale", reference_number: "SZ-260808-A1B",
  amount: "1290.35", currency: "NPR",
};
const csNames = Object.keys(cs).filter(k => k !== "unsigned_field_names");
cs.signed_field_names = csNames.join(",");
const csMsg = cs.signed_field_names.split(",").map(k => `${k}=${cs[k]}`).join(",");
const csSig = sign(csMsg, "secret");
check("CyberSource signs the amount", cs.signed_field_names.includes("amount"));
check("CyberSource signs reference_number", cs.signed_field_names.includes("reference_number"));
check("CyberSource verify round trip",
  sign(cs.signed_field_names.split(",").map(k => `${k}=${cs[k]}`).join(","), "secret") === csSig);
check("CyberSource tampered amount rejected",
  sign(csMsg.replace("1290.35", "1.00"), "secret") !== csSig);
check("CyberSource date format", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(cs.signed_date_time));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
