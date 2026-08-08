import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getGatewayCredentials } from "./config";

/**
 * CyberSource Secure Acceptance — Hosted Checkout.
 *
 * The customer posts a signed field set to CyberSource, pays on their page, and
 * is returned with a signed response. Card details never touch this server,
 * which is the point of the hosted flow: it keeps the storefront out of PCI
 * scope entirely.
 *
 * Signature: base64(HMAC-SHA256(secretKey, "field=value,field=value,…")) over
 * exactly the fields named in `signed_field_names`, in that order — the same
 * construction in both directions.
 */

const PAY_URL = {
  test: "https://testsecureacceptance.cybersource.com/pay",
  live: "https://secureacceptance.cybersource.com/pay",
} as const;

export interface CybersourceForm {
  action: string;
  fields: Record<string, string>;
}

function sign(fields: Record<string, string>, signedNames: string, secret: string): string {
  const message = signedNames
    .split(",")
    .map((name) => `${name}=${fields[name] ?? ""}`)
    .join(",");
  return createHmac("sha256", secret).update(message).digest("base64");
}

/** CyberSource wants `yyyy-MM-ddTHH:mm:ssZ`, always UTC. */
function signedDateTime(now: Date): string {
  return `${now.toISOString().slice(0, 19)}Z`;
}

export async function buildCardForm(input: {
  referenceNumber: string;
  totalMinor: number;
  currency?: string;
  customerName: string;
  email: string;
  phone: string;
  now?: Date;
}): Promise<CybersourceForm> {
  const config = await getGatewayCredentials("cybersource");
  const mode = config?.mode ?? "test";
  const profileId = config?.credentials.profile_id ?? "";
  const accessKey = config?.credentials.access_key ?? "";
  const secretKey = config?.credentials.secret_key ?? "";
  if (!profileId || !accessKey || !secretKey) {
    throw new Error("CyberSource is not configured");
  }

  const [firstName, ...rest] = input.customerName.trim().split(/\s+/);

  const fields: Record<string, string> = {
    access_key: accessKey,
    profile_id: profileId,
    transaction_uuid: randomUUID(),
    signed_field_names: "",
    unsigned_field_names: "",
    signed_date_time: signedDateTime(input.now ?? new Date()),
    locale: "en",
    transaction_type: "sale",
    reference_number: input.referenceNumber,
    amount: (input.totalMinor / 100).toFixed(2),
    currency: input.currency ?? "NPR",
    bill_to_forename: firstName || "Customer",
    bill_to_surname: rest.join(" ") || "-",
    bill_to_email: input.email,
    bill_to_phone: input.phone,
  };

  // Every field is signed. Leaving any of them unsigned would let the customer
  // edit it in the browser — the amount above all.
  const signedNames = Object.keys(fields).filter((key) => key !== "unsigned_field_names");
  fields.signed_field_names = signedNames.join(",");
  fields.signature = sign(fields, fields.signed_field_names, secretKey);

  return { action: PAY_URL[mode], fields };
}

export interface CardReturn {
  referenceNumber: string;
  decision: string;
  totalMinor: number;
  transactionId: string | null;
}

/**
 * Verify CyberSource's signed response.
 *
 * Returns null when the signature does not match. The response arrives as a
 * browser form post, so without this check anyone could post a fabricated
 * "ACCEPT" and have an order marked paid.
 */
export async function verifyCardReturn(
  body: Record<string, string>,
): Promise<CardReturn | null> {
  const config = await getGatewayCredentials("cybersource");
  const secretKey = config?.credentials.secret_key ?? "";
  const signedNames = body.signed_field_names ?? "";
  const claimed = body.signature ?? "";
  if (!secretKey || !signedNames || !claimed) return null;

  const expected = sign(body, signedNames, secretKey);
  const a = Buffer.from(expected);
  const b = Buffer.from(claimed);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const amount = Number(body.auth_amount ?? body.amount ?? 0);
  return {
    referenceNumber: body.req_reference_number ?? "",
    decision: (body.decision ?? "").toUpperCase(),
    totalMinor: Math.round(amount * 100),
    transactionId: body.transaction_id ?? null,
  };
}
