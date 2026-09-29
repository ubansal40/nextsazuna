import { after, NextResponse } from "next/server";
import { loadOrderForReceipt, markOrderFailed, markOrderPaid, markPaymentUnconfirmed } from "@/lib/orders";
import { notifyOrderPlaced } from "@/lib/order-notifications";
import { lookupKhaltiPayment } from "@/lib/payments/khalti";
import { siteOrigin } from "@/lib/site-url";

/**
 * Khalti return.
 *
 * Khalti appends `?pidx=&status=` and our `?order=&token=` rides along. The
 * status in the query is a browser redirect and proves nothing, so it is
 * ignored: the lookup call decides, and the amount it reports must match the
 * order to the paisa.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const site = await siteOrigin(url);

  const orderNumber = url.searchParams.get("order")?.trim() ?? "";
  const token = url.searchParams.get("token")?.trim();
  const pidx = url.searchParams.get("pidx")?.trim() ?? "";

  const fail = (reason: string) =>
    NextResponse.redirect(`${site}/checkout?payment=failed&reason=${encodeURIComponent(reason)}`);

  const order = await loadOrderForReceipt(orderNumber, token);
  if (!order) return fail("missing_order");

  if (!pidx) {
    await markOrderFailed(order.orderNumber, "Khalti return missing pidx");
    return fail("khalti_invalid_response");
  }

  const receipt = `${site}/checkout/confirmation?order=${encodeURIComponent(order.orderNumber)}&token=${encodeURIComponent(token ?? "")}`;

  const lookup = await lookupKhaltiPayment(pidx);
  /*
   * No answer, or "Pending", is not a "no" — the money may already have moved.
   * Both used to fail the order: the customer read "no charge was made", paid
   * again, and the pidx needed to reconcile the first payment was thrown away.
   * The order now waits with the pidx on it, and the receipt page says the
   * payment is being confirmed.
   */
  if (!lookup || lookup.status === "Pending") {
    await markPaymentUnconfirmed(
      order.orderNumber,
      `Khalti ${lookup ? "status Pending" : "lookup unanswered"} — pidx ${pidx}`,
    );
    return NextResponse.redirect(receipt);
  }

  if (lookup.status !== "Completed") {
    // Initiated, Expired, User canceled, Refunded — none of them are paid.
    await markOrderFailed(order.orderNumber, `Khalti status: ${lookup.status}`);
    return fail(`khalti_${lookup.status.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`);
  }

  if (lookup.totalMinor !== order.totalMinor) {
    await markOrderFailed(order.orderNumber, "Khalti amount mismatch");
    return fail("khalti_total_mismatch");
  }

  const justPromoted = await markOrderPaid(order.orderNumber, {
    transactionId: lookup.transactionId,
    gatewayRef: pidx,
  });
  if (justPromoted) {
    // Guarded by the transition, so a retried callback cannot send twice.
    // After the redirect, so a slow mail server cannot hold it up.
    after(() => notifyOrderPlaced(order.orderNumber));
  }

  return NextResponse.redirect(receipt);
}
