import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadOrderForReceipt } from "@/lib/orders";
import { Icon } from "@/components/ui";
import { ClearBagOnMount } from "./clear-bag";

/**
 * Order confirmation — where the gateways land after a payment.
 *
 * Server-rendered from the order row rather than from anything the gateway put
 * in the URL, so the page cannot be made to claim a payment that did not
 * settle.
 */

export const metadata: Metadata = {
  title: "Order confirmed",
  robots: { index: false, follow: false },
};

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; token?: string }>;
}) {
  const params = await searchParams;
  const orderNumber = params.order?.trim() ?? "";

  // The token is required. Without it the order number alone would read out a
  // customer's name and total to anyone who tried it.
  const order = await loadOrderForReceipt(orderNumber, params.token?.trim());
  if (!order) notFound();

  const paid = order.paymentStatus === "paid";

  return (
    <div className="mx-auto max-w-[var(--sz-container)] px-10 pb-24 checkout-narrow:px-[18px]">
      <div className="mt-7 rounded-[var(--sz-radius-modal)] border border-line-soft bg-raised px-6 py-20 text-center animate-sheet-up">
        <span
          className={
            paid
              ? "inline-flex size-[60px] items-center justify-center rounded-pill bg-success-soft text-success"
              : "inline-flex size-[60px] items-center justify-center rounded-pill bg-warning-soft text-warning"
          }
        >
          <Icon name={paid ? "check" : "info"} size={30} strokeWidth={paid ? 2.2 : 1.8} />
        </span>

        <h1 className="m-0 mt-[22px] font-[family-name:var(--sz-font-display)] text-h2 font-normal tracking-tight text-heading checkout-stacked:text-h2-sm">
          {paid ? "Order placed" : "Payment pending"}
        </h1>

        <p className="mx-auto mt-2.5 max-w-[44ch] text-control leading-[1.6] text-muted">
          {paid ? (
            <>
              Thank you. Your order{" "}
              <strong className="font-mono text-body">{order.orderNumber}</strong> is confirmed —
              we&rsquo;ll be in touch shortly to arrange delivery.
            </>
          ) : (
            <>
              We haven&rsquo;t had confirmation from your payment provider for order{" "}
              <strong className="font-mono text-body">{order.orderNumber}</strong> yet. If money
              left your account, it will settle shortly and we will be in touch.
            </>
          )}
        </p>

        <div className="mt-[26px] flex flex-wrap justify-center gap-3">
          <Link
            href="/jewellery"
            className="inline-flex items-center justify-center rounded-[var(--sz-radius-thumb)] bg-primary-700 px-6 text-sm font-semibold text-white no-underline min-h-12 hover:bg-primary-800 hover:text-white hover:no-underline"
          >
            Continue shopping
          </Link>
        </div>
      </div>

      {/* The order exists server-side now, so the browser's copy is spent. */}
      {paid && <ClearBagOnMount />}
    </div>
  );
}
