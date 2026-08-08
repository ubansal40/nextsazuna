import "server-only";

import { getGatewayCredentials } from "./config";

/**
 * eSewa legacy ePay.
 *
 * Ported from the Express app's `server/services/payment-esewa.js`. This is
 * the merchant-code-only API the WooCommerce plugins use, and the one Sazuna
 * is actually onboarded against: the only credential is the service code
 * (ES-…). There is no secret key and no signature.
 *
 * An earlier version of this file implemented ePay **v2**, which signs with an
 * HMAC secret. That secret does not exist for this merchant, so the v2 flow
 * could never have completed a live payment.
 *
 * Two steps:
 *   1. The browser auto-posts a form to /epay/main and the buyer authorises.
 *   2. eSewa redirects to our success URL with ?oid&amt&refId. Because that
 *      URL is just a GET anyone can type, the redirect proves nothing on its
 *      own — we POST the reference to /epay/transrec and only a
 *      <response_code>Success</response_code> means the money moved.
 */

const FORM_URL = {
  test: "https://uat.esewa.com.np/epay/main",
  live: "https://esewa.com.np/epay/main",
} as const;

const VERIFY_URL = {
  test: "https://uat.esewa.com.np/epay/transrec",
  live: "https://esewa.com.np/epay/transrec",
} as const;

export interface EsewaForm {
  action: string;
  fields: Record<string, string>;
}

async function settings() {
  const config = await getGatewayCredentials("esewa");
  const mode = config?.mode ?? "test";
  return {
    mode,
    merchant: config?.credentials.merchant_code ?? "",
    formUrl: FORM_URL[mode],
    verifyUrl: VERIFY_URL[mode],
  };
}

/**
 * The form the browser posts to eSewa.
 *
 * `pid` is our order number: eSewa echoes it back as `oid`, which is how the
 * return is matched to an order.
 */
export async function buildEsewaForm(input: {
  orderNumber: string;
  totalMinor: number;
  successUrl: string;
  failureUrl: string;
}): Promise<EsewaForm> {
  const { merchant, formUrl } = await settings();
  if (!merchant) throw new Error("eSewa is not configured: merchant_code is missing");

  const amount = input.totalMinor / 100;

  return {
    action: formUrl,
    fields: {
      amt: amount.toFixed(2),
      psc: "0.00",
      pdc: "0.00",
      txAmt: "0.00",
      // Total is the sum of the four; with no charges or tax it equals `amt`.
      tAmt: amount.toFixed(2),
      pid: input.orderNumber,
      scd: merchant,
      su: input.successUrl,
      fu: input.failureUrl,
    },
  };
}

export interface EsewaVerification {
  ok: boolean;
  /** "Success", "Pending", an HTTP/network marker, or null when unparsable. */
  status: string | null;
}

/**
 * Confirm a payment with eSewa directly.
 *
 * This is the only thing that establishes payment. A "Pending" response is a
 * bank hold and is deliberately not treated as paid.
 */
export async function verifyEsewaPayment(input: {
  orderNumber: string;
  totalMinor: number;
  referenceId: string;
}): Promise<EsewaVerification> {
  const { merchant, verifyUrl } = await settings();
  if (!merchant) return { ok: false, status: "not_configured" };

  const body = new URLSearchParams({
    amt: (input.totalMinor / 100).toFixed(2),
    scd: merchant,
    pid: input.orderNumber,
    rid: input.referenceId,
  });

  let text: string;
  try {
    const response = await fetch(verifyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "text/xml, application/xml, */*",
      },
      body: body.toString(),
      cache: "no-store",
    });
    text = await response.text();
    if (!response.ok) return { ok: false, status: `http_${response.status}` };
  } catch {
    return { ok: false, status: "network_error" };
  }

  // The response is a few dozen bytes with one tag worth reading; a DOM parser
  // would cost more than it buys.
  const match = /<response_code\s*>\s*([^<]+?)\s*<\/response_code\s*>/i.exec(text);
  const status = match ? match[1].trim() : null;

  return { ok: (status ?? "").toLowerCase() === "success", status };
}
