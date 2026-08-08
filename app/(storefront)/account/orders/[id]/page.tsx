import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/ui";
import { OrderView } from "@/components/orders/order-view";
import { requireCustomer } from "@/lib/auth/require";
import { loadOrderForCustomer } from "@/lib/orders";
import { AccountShell } from "../../_components/account-shell";

/**
 * One order — Sazuna Account.dc.html §Order detail.
 *
 * Renders through the same component as the confirmation page and the guest
 * tracker, so all three agree about what an order looks like.
 */

export const metadata: Metadata = {
  title: "Order",
  robots: { index: false, follow: false },
};

export default async function AccountOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const customer = await requireCustomer();
  const { id } = await params;

  /**
   * 404, never 403. Telling someone their id is real but not theirs would let
   * anyone signed in enumerate which order numbers exist.
   */
  const order = await loadOrderForCustomer(Number(id), customer.id);
  if (!order) notFound();

  return (
    <AccountShell current="/account/orders" title={order.orderNumber} kicker="Order">
      <Link
        href="/account/orders"
        className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-primary-700 no-underline hover:no-underline"
      >
        <Icon name="arrow-left" size={15} />
        All orders
      </Link>

      <OrderView order={order} variant="status" />
    </AccountShell>
  );
}
