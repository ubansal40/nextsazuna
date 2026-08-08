import { NextResponse } from "next/server";
import { loadOrderForReceipt, markOrderFailed, markOrderPaid } from "@/lib/orders";
import { notifyOrderPlaced } from "@/lib/order-notifications";
import { verifyEsewaPayment } from "@/lib/payments/esewa";
import { siteOrigin } from "@/lib/site-url";

/**
 * eSewa return — success leg.
 *
 * eSewa sends `?oid=<our order number>&amt=<total>&refId=<their reference>`,
 * and our own `?order=&token=` rides along so the order cannot be looked up by
 * number alone.
 *
 * This URL is a plain GET that anyone can type, so arriving here proves
 * nothing. The chain, ported from the Express app, is: authorise the lookup,
 * check eSewa echoed back the order and amount we sent, then ask eSewa's own
 * server whether the money moved. Only the last step settles the order.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const site = await siteOrigin(url);

  const orderNumber = url.searchParams.get("order")?.trim() ?? "";
  const token = url.searchParams.get("token")?.trim();

  const fail = (reason: string) =>
    NextResponse.redirect(
      `${site}/checkout?payment=failed&reason=${encodeURIComponent(reason)}`,
    );

  const order = await loadOrderForReceipt(orderNumber, token);
  if (!order) return fail("missing_order");

  const oid = url.searchParams.get("oid")?.trim() ?? "";
  const amt = url.searchParams.get("amt")?.trim() ?? "";
  const refId = url.searchParams.get("refId")?.trim() ?? "";

  if (!oid || !amt || !refId) {
    await markOrderFailed(order.orderNumber, "eSewa redirect missing oid/amt/refId");
    return fail("esewa_invalid_response");
  }

  if (oid !== order.orderNumber) {
    await markOrderFailed(order.orderNumber, "eSewa oid mismatch");
    return fail("esewa_order_mismatch");
  }

  // Compared in paisa with a one-paisa tolerance, because the amount comes
  // back as a formatted decimal string.
  const echoedMinor = Math.round(Number(amt.replace(/[^0-9.]/g, "")) * 100);
  if (!Number.isFinite(echoedMinor) || Math.abs(echoedMinor - order.totalMinor) > 1) {
    await markOrderFailed(order.orderNumber, "eSewa amount mismatch");
    return fail("esewa_total_mismatch");
  }

  const verification = await verifyEsewaPayment({
    orderNumber: order.orderNumber,
    totalMinor: order.totalMinor,
    referenceId: refId,
  });

  if (!verification.ok) {
    // "Pending" is a bank hold, not a payment. Treated as unpaid on purpose.
    await markOrderFailed(order.orderNumber, `eSewa verify status: ${verification.status ?? "unknown"}`);
    return fail(`esewa_${(verification.status ?? "failed").toLowerCase().replace(/[^a-z0-9]+/g, "_")}`);
  }

  const justPromoted = await markOrderPaid(order.orderNumber, { transactionId: refId });
  if (justPromoted) {
    // Guarded by the transition, so a retried callback cannot send twice.
    await notifyOrderPlaced(order.orderNumber);
  }

  return NextResponse.redirect(
    `${site}/checkout/confirmation?order=${encodeURIComponent(order.orderNumber)}&token=${encodeURIComponent(token ?? "")}`,
  );
}
