import { NextResponse } from "next/server";
import { settleOrder } from "@/lib/orders";

/**
 * eSewa return — failure leg.
 *
 * eSewa does not sign this one, so it is treated as a hint rather than proof:
 * it only ever moves an order from pending to failed, which is the safe
 * direction. A later status check can still find a payment that landed.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const order = url.searchParams.get("order");
  const site = process.env.SAZUNA_SITE_URL ?? url.origin;

  if (order) await settleOrder(order, "failed");

  return NextResponse.redirect(`${site}/checkout?payment=failed`);
}
