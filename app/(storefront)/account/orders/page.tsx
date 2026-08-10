import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/ui";
import { requireCustomer } from "@/lib/auth/require";
import { listCustomerOrders } from "@/lib/customers";
import { HIDDEN_ORDER_STATUSES } from "@/lib/order-lookup";
import { formatPrice } from "@/lib/format";
import { AccountShell, accountCard, accountEyebrow } from "../_components/account-shell";

/**
 * Order history — Sazuna Account.dc.html §Orders.
 *
 * Scoped to the session customer in the query itself, and filtered through the
 * one HIDDEN_ORDER_STATUSES list that the guest lookup also uses — the
 * reference keeps two copies of that constant with a comment in each promising
 * they agree.
 */

export const metadata: Metadata = {
  title: "Your orders",
  robots: { index: false, follow: false },
};

export default async function AccountOrdersPage() {
  const customer = await requireCustomer();
  const orders = await listCustomerOrders(customer.id, HIDDEN_ORDER_STATUSES);

  return (
    <AccountShell current="/account/orders" title="Your orders">
      {orders.length === 0 ? (
        <div className={`${accountCard} py-16 text-center`}>
          <span className="inline-flex items-center justify-center gap-2.5">
            <span aria-hidden className="size-3 rotate-45 bg-line" />
            <span aria-hidden className="size-[19px] rotate-45 bg-accent opacity-60" />
            <span aria-hidden className="size-3 rotate-45 bg-line" />
          </span>
          <p className="m-0 mt-5 font-[family-name:var(--sz-font-display)] text-modal-title font-medium text-heading">
            No orders yet
          </p>
          <p className="mx-auto m-0 mt-2 max-w-[38ch] text-sm leading-relaxed text-muted">
            When you buy something, it will appear here — with its status and everything you
            ordered.
          </p>
          <Link
            href="/jewellery"
            className="mt-5 inline-flex items-center justify-center rounded-[var(--sz-radius-control)] bg-primary-700 px-6 text-control font-semibold text-white no-underline min-h-12 hover:bg-primary-800 hover:text-white hover:no-underline"
          >
            Browse the collection
          </Link>
        </div>
      ) : (
        <section className={accountCard}>
          <p className={accountEyebrow}>
            {orders.length} {orders.length === 1 ? "order" : "orders"}
          </p>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {orders.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/account/orders/${order.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-[var(--sz-radius-md)] border border-line-soft px-4 py-3.5 no-underline transition-colors duration-[var(--sz-dur-fast)] hover:border-accent hover:no-underline"
                >
                  <span className="font-mono text-sm font-semibold text-heading">
                    {order.order_number}
                  </span>
                  <span className="rounded-pill bg-surface px-2.5 py-1 text-2xs font-semibold text-muted capitalize">
                    {order.status.replace(/_/g, " ")}
                  </span>
                  <span className="text-trust text-muted">
                    {new Date(order.created_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {" · "}
                    {Number(order.item_count)}{" "}
                    {Number(order.item_count) === 1 ? "item" : "items"}
                  </span>
                  {/* formatPrice returns null for an absent total; without the
                      fallback the row's amount is simply missing. */}
                  <span className="ms-auto font-mono text-sm text-body tabular-nums">
                    {formatPrice(order.total_amount) ?? "—"}
                  </span>
                  <Icon name="chevron-right" size={16} className="text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </AccountShell>
  );
}
