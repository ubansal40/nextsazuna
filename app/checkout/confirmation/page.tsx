import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrderView } from "@/components/orders/order-view";
import { loadOrderReceipt } from "@/lib/orders";
import { ClearBagOnMount } from "./clear-bag";

/**
 * Order confirmation — Sazuna Order Status.dc.html §order success.
 *
 * Where the gateways land after a payment. Server-rendered from the order row
 * rather than from anything the gateway put in the URL, so the page cannot be
 * made to claim a payment that did not settle.
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
  // customer's name, address and items to anyone who tried it.
  const order = await loadOrderReceipt(orderNumber, params.token?.trim());
  if (!order) notFound();

  /**
   * Placed is about the order, not the money.
   *
   * A cash order is `placed` with `payment_status = 'pending'` — the cash has
   * genuinely not been collected yet — so keying off payment status told every
   * COD customer their payment had failed. Only an order still waiting on a
   * gateway, or one it rejected, is unplaced.
   */
  const placed = order.status === "placed";

  return (
    <div className="mx-auto max-w-[var(--sz-container)] px-10 pb-24 checkout-narrow:px-[18px]">
      <OrderView order={order} variant="confirmation" onTrackHref="/order-status" />

      {/* The order exists server-side now, so the browser's copy is spent. */}
      {placed && <ClearBagOnMount />}
    </div>
  );
}
