import { NextResponse } from "next/server";
import { lookupOrderByContact } from "@/lib/orders";
import { rateLimit, requestIp } from "@/lib/rate-limit";

/**
 * Guest order lookup — mirrors the Express app's POST /api/orders/lookup.
 *
 * The only public endpoint that returns order details without the HMAC token
 * minted at checkout. Knowing the order number is not enough; the caller must
 * also know the phone or email used at checkout, and that check — in
 * lib/order-lookup.ts — is the access control.
 *
 * Every failure answers 404 with the same body. A wrong order number, a right
 * one with the wrong contact, and an order still awaiting its gateway are
 * indistinguishable from out here, which is the whole point: anything else
 * confirms which order numbers exist.
 */

export const dynamic = "force-dynamic";

/** One message, whatever went wrong. */
const NOT_FOUND = {
  error:
    "We couldn't find an order with those details. Check the order number and the phone or email you used at checkout.",
};

export async function POST(request: Request) {
  /**
   * Bucketed on the caller and on the order number they are probing, so a
   * distributed guess at one order is slowed even when each request comes from
   * a different address. Defence in depth — the real controls are the contact
   * check and the non-sequential order number.
   */
  const ip = requestIp(request.headers);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const payload = (body ?? {}) as { order_number?: unknown; contact?: unknown };
  const orderNumber = String(payload.order_number ?? "").trim().slice(0, 64);
  const contact = String(payload.contact ?? "").trim().slice(0, 200);

  if (!orderNumber || !contact) {
    return NextResponse.json(
      { error: "Enter your order number and the phone or email used at checkout." },
      { status: 400 },
    );
  }

  for (const key of [`lookup:ip:${ip}`, `lookup:order:${orderNumber.toLowerCase()}`]) {
    const limit = rateLimit(key, { limit: 5, windowMs: 60_000 });
    if (!limit.ok) {
      return NextResponse.json(
        { error: "Too many attempts. Please wait a moment and try again." },
        { status: 429, headers: { "retry-after": String(limit.retryAfter) } },
      );
    }
  }

  try {
    const order = await lookupOrderByContact(orderNumber, contact);
    if (!order) return NextResponse.json(NOT_FOUND, { status: 404 });
    return NextResponse.json({ order });
  } catch (error) {
    // The detail belongs in the server log, not in a response a stranger can probe.
    console.error("[orders/lookup] failed", error);
    return NextResponse.json({ error: "Unable to look up that order right now." }, { status: 500 });
  }
}
