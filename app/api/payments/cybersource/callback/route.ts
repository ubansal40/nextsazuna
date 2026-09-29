import { after, NextResponse } from "next/server";
import { markOrderFailed, markOrderPaid, markPaymentUnconfirmed } from "@/lib/orders";
import { notifyOrderPlaced } from "@/lib/order-notifications";
import { orderLookupToken } from "@/lib/order-tokens";
import { verifyCardReturn } from "@/lib/payments/cybersource";
import { siteOrigin } from "@/lib/site-url";

/**
 * CyberSource Secure Acceptance return.
 *
 * Arrives as a browser form post, which means anyone can post to it. The
 * signature over `signed_field_names` is the only thing that distinguishes a
 * real ACCEPT from a fabricated one, so an unverified body is discarded before
 * any order is touched.
 */
export async function POST(request: Request) {
  // The same origin rule as the other gateways' returns (and the one that built
  // the URLs this post was sent from), trailing slash and proxy headers handled.
  const site = await siteOrigin(new URL(request.url));

  let body: Record<string, string>;
  try {
    const form = await request.formData();
    body = Object.fromEntries(
      [...form.entries()].map(([key, value]) => [key, typeof value === "string" ? value : ""]),
    );
  } catch {
    return NextResponse.redirect(`${site}/checkout?payment=failed`, { status: 303 });
  }

  const result = await verifyCardReturn(body);
  if (!result?.referenceNumber) {
    return NextResponse.redirect(`${site}/checkout?payment=failed`, { status: 303 });
  }

  // The reference number came back inside a signed payload, so minting the
  // receipt token here is safe — it is not something the caller supplied.
  const token = orderLookupToken(result.referenceNumber);
  const receipt = `${site}/checkout/confirmation?order=${encodeURIComponent(result.referenceNumber)}&token=${encodeURIComponent(token)}`;

  /*
   * REVIEW is held rather than treated as paid — releasing goods on a flagged
   * transaction is exactly the case fraud screening exists to catch. But held
   * is not declined: the card is authorised, and the money is captured if the
   * review is accepted. It used to fail the order as `card_declined`, telling
   * the customer no charge was made and inviting a second authorisation. It
   * now waits for the review, transaction id on the order.
   */
  if (result.decision === "REVIEW") {
    await markPaymentUnconfirmed(
      result.referenceNumber,
      `CyberSource decision REVIEW — transaction ${result.transactionId ?? "unknown"}`,
    );
    // 303 so the browser follows with GET rather than replaying the POST.
    return NextResponse.redirect(receipt, { status: 303 });
  }

  // ACCEPT is the only decision that means the money moved.
  if (result.decision !== "ACCEPT") {
    await markOrderFailed(result.referenceNumber, `CyberSource decision: ${result.decision}`);
    return NextResponse.redirect(`${site}/checkout?payment=failed&reason=card_declined`, {
      status: 303,
    });
  }

  const justPromoted = await markOrderPaid(result.referenceNumber, {
    transactionId: result.transactionId,
  });
  if (justPromoted) {
    // Guarded by the transition, so a retried callback cannot send twice.
    // After the redirect, so a slow mail server cannot hold it up.
    after(() => notifyOrderPlaced(result.referenceNumber));
  }

  return NextResponse.redirect(receipt, { status: 303 });
}
