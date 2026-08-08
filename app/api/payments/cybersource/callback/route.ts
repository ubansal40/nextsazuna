import { NextResponse } from "next/server";
import { markOrderFailed, markOrderPaid } from "@/lib/orders";
import { orderLookupToken } from "@/lib/order-tokens";
import { verifyCardReturn } from "@/lib/payments/cybersource";

/**
 * CyberSource Secure Acceptance return.
 *
 * Arrives as a browser form post, which means anyone can post to it. The
 * signature over `signed_field_names` is the only thing that distinguishes a
 * real ACCEPT from a fabricated one, so an unverified body is discarded before
 * any order is touched.
 */
export async function POST(request: Request) {
  const site = process.env.SAZUNA_SITE_URL ?? new URL(request.url).origin;

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

  // ACCEPT is the only decision that means the money moved. REVIEW is held
  // rather than treated as paid — releasing goods on a flagged transaction is
  // exactly the case fraud screening exists to catch.
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
    // TODO(stage-1): confirmation and admin alert emails, once ported. Guarded
    // so a replayed callback cannot send them twice.
  }

  // The reference number came back inside a signed payload, so minting the
  // receipt token here is safe — it is not something the caller supplied.
  const token = orderLookupToken(result.referenceNumber);
  return NextResponse.redirect(
    `${site}/checkout/confirmation?order=${encodeURIComponent(result.referenceNumber)}&token=${encodeURIComponent(token)}`,
    // 303 so the browser follows with GET rather than replaying the POST.
    { status: 303 },
  );
}
