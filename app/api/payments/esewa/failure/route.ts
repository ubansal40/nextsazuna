import { NextResponse } from "next/server";
import { loadOrderForReceipt, markOrderFailed } from "@/lib/orders";
import { siteOrigin } from "@/lib/site-url";

/**
 * eSewa return — failure leg.
 *
 * eSewa signs nothing here, so this is a hint rather than proof. It only ever
 * moves an order from unpaid to failed, which is the safe direction: a genuine
 * payment that lands later still wins, because `markOrderFailed` refuses to
 * override a paid row.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const site = await siteOrigin(url);

  const orderNumber = url.searchParams.get("order")?.trim() ?? "";
  const token = url.searchParams.get("token")?.trim();

  const order = await loadOrderForReceipt(orderNumber, token);
  if (order) await markOrderFailed(order.orderNumber, "eSewa returned failure");

  return NextResponse.redirect(`${site}/checkout?payment=failed&reason=esewa_cancelled`);
}
