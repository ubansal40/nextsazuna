import { NextResponse } from "next/server";
import { settleOrder } from "@/lib/orders";
import { fetchStatus, verifyReturn } from "@/lib/payments/esewa";

/**
 * eSewa return — success leg.
 *
 * A browser can navigate here directly, so nothing is believed without eSewa's
 * signature over the payload. If the signature does not verify, or the status
 * is not COMPLETE, the order is left pending and the customer sees the failure
 * panel: a free order is a worse outcome than a wrongly-failed one, which a
 * human can fix.
 */
export async function GET(request: Request) {
  const encoded = new URL(request.url).searchParams.get("data");
  const site = process.env.SAZUNA_SITE_URL ?? new URL(request.url).origin;

  const fail = (order?: string) =>
    NextResponse.redirect(
      `${site}/checkout?payment=failed${order ? `&order=${encodeURIComponent(order)}` : ""}`,
    );

  if (!encoded) return fail();

  const result = await verifyReturn(encoded);
  if (!result?.transactionUuid) return fail();

  // Trust the gateway's own record over the redirect, which is replayable.
  const confirmed =
    result.status === "COMPLETE"
      ? "COMPLETE"
      : await fetchStatus(result.transactionUuid, result.totalMinor);

  if (confirmed !== "COMPLETE") {
    await settleOrder(result.transactionUuid, "failed");
    return fail(result.transactionUuid);
  }

  await settleOrder(result.transactionUuid, "paid");
  return NextResponse.redirect(
    `${site}/checkout/confirmation?order=${encodeURIComponent(result.transactionUuid)}`,
  );
}
