import { NextResponse } from "next/server";
import { settleOrder } from "@/lib/orders";
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
    await settleOrder(result.referenceNumber, "failed");
    return NextResponse.redirect(`${site}/checkout?payment=failed`, { status: 303 });
  }

  await settleOrder(result.referenceNumber, "paid");
  return NextResponse.redirect(
    `${site}/checkout/confirmation?order=${encodeURIComponent(result.referenceNumber)}`,
    // 303 so the browser follows with GET rather than replaying the POST.
    { status: 303 },
  );
}
