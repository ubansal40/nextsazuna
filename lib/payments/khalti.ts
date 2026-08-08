import "server-only";

import { getGatewayCredentials } from "./config";

/**
 * Khalti KPG-2 ePayment.
 *
 * Ported from the Express app's `server/services/payment-khalti.js`.
 *
 * Server-to-server, unlike the other two: we initiate the payment from here
 * and get back a `pidx` and a URL to send the buyer to. On return, Khalti puts
 * `?pidx=&status=` in the query — which is a browser redirect and therefore
 * unproven. Only the lookup call, plus an amount that matches the order,
 * settles anything.
 *
 * Khalti works in paisa throughout, which happens to be how this codebase
 * carries money already, so no conversion is needed on our side.
 */

const HOST = {
  test: "https://a.khalti.com",
  live: "https://khalti.com",
} as const;

export interface KhaltiSession {
  pidx: string;
  paymentUrl: string;
  expiresAt: string | null;
}

async function settings() {
  const config = await getGatewayCredentials("khalti");
  const mode = config?.mode ?? "test";
  return {
    mode,
    secretKey: config?.credentials.secret_key ?? "",
    host: HOST[mode],
  };
}

async function call<T>(
  path: string,
  body: unknown,
  secretKey: string,
  host: string,
): Promise<{ ok: boolean; status: number; body: T | null }> {
  const response = await fetch(`${host}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Key ${secretKey}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const text = await response.text();
  let parsed: T | null = null;
  try {
    parsed = text ? (JSON.parse(text) as T) : null;
  } catch {
    parsed = null;
  }
  return { ok: response.ok, status: response.status, body: parsed };
}

/** Start a payment. Returns where to send the buyer. */
export async function initiateKhaltiPayment(input: {
  orderNumber: string;
  totalMinor: number;
  returnUrl: string;
  websiteUrl: string;
  customer: { name: string; email: string; phone: string };
}): Promise<KhaltiSession> {
  const { secretKey, host } = await settings();
  if (!secretKey) throw new Error("Khalti is not configured: secret_key is missing");

  const { ok, status, body } = await call<{
    pidx?: string;
    payment_url?: string;
    expires_at?: string;
    detail?: string;
  }>(
    "/api/v2/epayment/initiate/",
    {
      return_url: input.returnUrl,
      website_url: input.websiteUrl,
      // Already paisa — Khalti's unit and ours agree.
      amount: input.totalMinor,
      purchase_order_id: input.orderNumber,
      purchase_order_name: `Sazuna order ${input.orderNumber}`,
      customer_info: {
        name: input.customer.name.slice(0, 64),
        email: input.customer.email.slice(0, 64),
        phone: input.customer.phone.slice(0, 32),
      },
    },
    secretKey,
    host,
  );

  if (!ok || !body?.pidx || !body?.payment_url) {
    throw new Error(body?.detail ?? `Khalti initiate failed (HTTP ${status})`);
  }

  return { pidx: body.pidx, paymentUrl: body.payment_url, expiresAt: body.expires_at ?? null };
}

export interface KhaltiLookup {
  status: string;
  totalMinor: number;
  transactionId: string | null;
}

/**
 * Ask Khalti what happened. This is the only thing that establishes payment —
 * the `status` in the return URL is a query parameter anyone could type.
 */
export async function lookupKhaltiPayment(pidx: string): Promise<KhaltiLookup | null> {
  const { secretKey, host } = await settings();
  if (!secretKey) return null;

  try {
    const { ok, body } = await call<{
      status?: string;
      total_amount?: number;
      transaction_id?: string;
    }>("/api/v2/epayment/lookup/", { pidx }, secretKey, host);

    if (!ok || !body?.status) return null;

    return {
      status: body.status,
      totalMinor: Number(body.total_amount) || 0,
      transactionId: body.transaction_id ?? null,
    };
  } catch {
    return null;
  }
}
