import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { getGatewayCredentials } from "./config";

/**
 * eSewa ePay v2.
 *
 * The customer is redirected by a self-submitting form post; eSewa returns to
 * `success_url` with a base64 payload that carries its own signature. The
 * signature is what makes the return trustworthy — a browser can navigate to
 * the success URL directly, so an unverified return is an open door to free
 * orders. `verifyReturn` is therefore not optional.
 *
 * Signature: base64(HMAC-SHA256(secret, "total_amount=…,transaction_uuid=…,product_code=…"))
 * over exactly the fields named in `signed_field_names`, in that order.
 */

const FORM_URL = {
  test: "https://rc-epay.esewa.com.np/api/epay/main/v2/form",
  live: "https://epay.esewa.com.np/api/epay/main/v2/form",
} as const;

const STATUS_URL = {
  test: "https://rc.esewa.com.np/api/epay/transaction/status/",
  live: "https://epay.esewa.com.np/api/epay/transaction/status/",
} as const;

/** eSewa's published sandbox credentials. Used only when mode is "test". */
const TEST_MERCHANT = "EPAYTEST";
const TEST_SECRET = "8gBm/:&EnhH.1/q";

const SIGNED_FIELDS = "total_amount,transaction_uuid,product_code";

export interface EsewaForm {
  action: string;
  fields: Record<string, string>;
}

function sign(message: string, secret: string): string {
  return createHmac("sha256", secret).update(message).digest("base64");
}

/** Rupees, to two decimals — eSewa rejects amounts with more precision. */
function rupees(minor: number): string {
  return (minor / 100).toFixed(2);
}

async function settings() {
  const config = await getGatewayCredentials("esewa");
  const mode = config?.mode ?? "test";
  const live = mode === "live";
  return {
    mode,
    merchant: live ? (config?.credentials.merchant_code ?? "") : TEST_MERCHANT,
    secret: live ? (config?.credentials.secret_key ?? "") : TEST_SECRET,
    formUrl: FORM_URL[mode],
    statusUrl: STATUS_URL[mode],
  };
}

/**
 * Build the form the browser posts to eSewa.
 *
 * `transactionUuid` is our order number: eSewa echoes it back, and it is how
 * the return is matched to an order.
 */
export async function buildEsewaForm(input: {
  transactionUuid: string;
  totalMinor: number;
  successUrl: string;
  failureUrl: string;
}): Promise<EsewaForm> {
  const { merchant, secret, formUrl } = await settings();
  if (!merchant || !secret) throw new Error("eSewa is not configured");

  const total = rupees(input.totalMinor);
  const fields: Record<string, string> = {
    amount: total,
    tax_amount: "0",
    total_amount: total,
    transaction_uuid: input.transactionUuid,
    product_code: merchant,
    product_service_charge: "0",
    product_delivery_charge: "0",
    success_url: input.successUrl,
    failure_url: input.failureUrl,
    signed_field_names: SIGNED_FIELDS,
  };

  const message = SIGNED_FIELDS.split(",")
    .map((field) => `${field}=${fields[field]}`)
    .join(",");
  fields.signature = sign(message, secret);

  return { action: formUrl, fields };
}

export interface EsewaReturn {
  transactionUuid: string;
  totalMinor: number;
  status: string;
  transactionCode: string | null;
}

/**
 * Verify and decode eSewa's `data` query parameter.
 *
 * Returns null when the payload is malformed or the signature does not match —
 * both mean "do not mark this order paid".
 */
export async function verifyReturn(encoded: string): Promise<EsewaReturn | null> {
  const { secret } = await settings();
  if (!secret) return null;

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  } catch {
    return null;
  }

  const signedNames = typeof payload.signed_field_names === "string" ? payload.signed_field_names : "";
  const claimed = typeof payload.signature === "string" ? payload.signature : "";
  if (!signedNames || !claimed) return null;

  const message = signedNames
    .split(",")
    .map((field) => `${field}=${payload[field] ?? ""}`)
    .join(",");
  const expected = sign(message, secret);

  // Constant-time: a length-independent comparison leaks nothing about how
  // close a forged signature was.
  const a = Buffer.from(expected);
  const b = Buffer.from(claimed);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const total = Number(payload.total_amount ?? 0);
  return {
    transactionUuid: String(payload.transaction_uuid ?? ""),
    totalMinor: Math.round(total * 100),
    status: String(payload.status ?? ""),
    transactionCode: payload.transaction_code ? String(payload.transaction_code) : null,
  };
}

/**
 * Ask eSewa directly what happened to a transaction.
 *
 * The return payload is signed and sufficient on its own, but a server-to-server
 * check is the only thing that survives a customer who closes the tab before
 * being redirected back.
 */
export async function fetchStatus(
  transactionUuid: string,
  totalMinor: number,
): Promise<string | null> {
  const { merchant, statusUrl } = await settings();
  if (!merchant) return null;

  const url = new URL(statusUrl);
  url.searchParams.set("product_code", merchant);
  url.searchParams.set("total_amount", rupees(totalMinor));
  url.searchParams.set("transaction_uuid", transactionUuid);

  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const body: { status?: unknown } = await response.json();
    return typeof body.status === "string" ? body.status : null;
  } catch {
    return null;
  }
}
