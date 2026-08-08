import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/ui";
import { requireCustomer } from "@/lib/auth/require";
import { listCustomerOrders, publicCustomer } from "@/lib/customers";
import { HIDDEN_ORDER_STATUSES } from "@/lib/order-lookup";
import { formatPrice } from "@/lib/format";
import { AccountShell, accountCard, accountEyebrow } from "./_components/account-shell";

/**
 * Account overview — Sazuna Account.dc.html §Overview.
 *
 * The landing panel: who we think you are, what you last bought, and the two
 * places most people came here for.
 */

export const metadata: Metadata = {
  title: "Your account",
  // Per-visitor and behind a session; there is nothing here to rank.
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  const row = await requireCustomer();
  const customer = publicCustomer(row);
  const orders = await listCustomerOrders(customer.id, HIDDEN_ORDER_STATUSES);
  const recent = orders.slice(0, 3);

  return (
    <AccountShell current="/account" title={`Namaste, ${customer.name || "there"}`}>
      <div className="grid gap-3.5 grid-cols-2 policy-stacked:grid-cols-1">
        <section className={accountCard}>
          <p className={accountEyebrow}>Orders</p>
          <p className="m-0 font-[family-name:var(--sz-font-display)] text-story-h2 leading-none text-heading">
            {orders.length}
          </p>
          <p className="m-0 mt-2 text-sm text-muted">
            {orders.length === 1 ? "order placed with us" : "orders placed with us"}
          </p>
          <Link
            href="/account/orders"
            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary-700 no-underline hover:no-underline"
          >
            View all
            <Icon name="arrow-right" size={15} />
          </Link>
        </section>

        <section className={accountCard}>
          <p className={accountEyebrow}>Signed in as</p>
          <p className="m-0 font-mono text-lg text-heading">{customer.phone}</p>
          {customer.email && <p className="m-0 mt-1 text-sm text-muted">{customer.email}</p>}
          <Link
            href="/account/profile"
            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary-700 no-underline hover:no-underline"
          >
            Edit your details
            <Icon name="arrow-right" size={15} />
          </Link>
        </section>
      </div>

      <section className={`${accountCard} mt-3.5`}>
        <p className={accountEyebrow}>Recent orders</p>

        {recent.length === 0 ? (
          <div className="py-8 text-center">
            <p className="m-0 text-sm text-muted">Nothing here yet.</p>
            <Link
              href="/jewellery"
              className="mt-4 inline-flex items-center justify-center rounded-[var(--sz-radius-control)] bg-primary-700 px-6 text-sm font-semibold text-white no-underline min-h-12 hover:bg-primary-800 hover:text-white hover:no-underline"
            >
              Browse the collection
            </Link>
          </div>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {recent.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/account/orders/${order.id}`}
                  className="flex flex-wrap items-center gap-3 rounded-[var(--sz-radius-md)] border border-line-soft px-4 py-3 no-underline transition-colors duration-[var(--sz-dur-fast)] hover:border-accent hover:no-underline"
                >
                  <span className="font-mono text-sm font-semibold text-heading">
                    {order.order_number}
                  </span>
                  <span className="text-trust text-muted">
                    {new Date(order.created_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                  <span className="ms-auto font-mono text-sm text-body tabular-nums">
                    {formatPrice(order.total_amount)}
                  </span>
                  <Icon name="chevron-right" size={16} className="text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AccountShell>
  );
}
