import type { Metadata } from "next";
import Link from "next/link";
import { Icon, type IconName } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { requireAdmin } from "@/lib/admin/require";
import { getDashboard } from "@/lib/admin/dashboard";

/**
 * Admin dashboard — Sazuna Admin.dc.html §Dashboard.
 *
 * The landing every admin sees. Three KPIs off the last 30 days, the most
 * recent orders, and the two actions an operator reaches for first. No section
 * gate: anyone with admin access lands here (it is also where an ungranted
 * staffer is bounced).
 */

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

const ORDER_CHIP: Record<string, string> = {
  pending_payment: "bg-warning-soft text-warning",
  payment_failed: "bg-error-soft text-error",
  placed: "bg-info-soft text-info",
  confirmed: "bg-info-soft text-info",
  billed: "bg-info-soft text-info",
  processing: "bg-warning-soft text-warning",
  completed: "bg-success-soft text-success",
  cancelled: "bg-error-soft text-error",
};

/** Statuses are stored snake_case; show them as words. */
function humanizeStatus(status: string): string {
  return status.replace(/_/g, " ");
}

function firstName(name: string | null, email: string): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed.split(/\s+/)[0];
  return email.split("@")[0];
}

export default async function AdminDashboardPage() {
  const admin = await requireAdmin();
  const { kpis, recent } = await getDashboard();

  return (
    <div className="mx-auto max-w-[1100px]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3.5">
        <h2 className="font-display text-2xl font-medium text-heading">
          Namaste, {firstName(admin.name, admin.email)}
        </h2>
        <p className="font-mono text-[11.5px] text-muted">Last 30 days</p>
      </div>

      {/* KPIs */}
      <div className="grid gap-3.5 sm:grid-cols-3">
        <Kpi label="Revenue" icon="wallet" value={formatPrice(kpis.revenue) ?? "रु 0"} delta={kpis.revenueDelta} />
        <Kpi label="Orders" icon="order-bag" value={String(kpis.orders)} delta={kpis.ordersDelta} />
        <Kpi label="Avg. order value" icon="receipt" value={formatPrice(kpis.aov) ?? "रु 0"} delta={null} />
      </div>

      {/* Recent orders */}
      <div className="mt-3.5 overflow-hidden rounded-[var(--sz-admin-radius-card)] border border-line bg-raised">
        <div className="flex items-center justify-between border-b border-line-soft px-4 py-3.5">
          <h3 className="text-[13.5px] font-semibold text-heading">Recent orders</h3>
          <Link href="/admin/orders" className="px-1 text-xs font-semibold text-primary-700 no-underline hover:underline">
            View all
          </Link>
        </div>

        {recent.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-muted">No orders yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line-soft text-left text-xs text-muted">
                  <th className="px-4 py-2.5 font-medium">Order</th>
                  <th className="px-4 py-2.5 font-medium">Customer</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Total</th>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((order) => (
                  <tr key={order.orderNumber} className="border-b border-line-soft last:border-0">
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono font-semibold text-heading">
                      {order.orderNumber}
                    </td>
                    <td className="px-4 py-2.5 text-body">{order.customerName}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          "inline-flex rounded-pill px-2.5 py-0.5 text-[11px] font-semibold capitalize",
                          ORDER_CHIP[order.status] ?? "bg-surface text-muted",
                        )}
                      >
                        {humanizeStatus(order.status)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-heading">
                      {formatPrice(order.total) ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-muted">{order.createdAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="mt-3.5 rounded-[var(--sz-admin-radius-card)] border border-line bg-raised p-4">
        <h3 className="mb-3 text-[12.5px] font-semibold text-heading">Quick actions</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <QuickAction href="/admin/products" icon="plus" label="Add product" />
          <QuickAction href="/admin/orders" icon="order-bag" label="View orders" />
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  icon,
  value,
  delta,
}: {
  label: string;
  icon: IconName;
  value: string;
  delta: number | null;
}) {
  return (
    <div className="rounded-[var(--sz-admin-radius-card)] border border-line bg-raised px-4 py-3.5">
      <div className="flex items-center justify-between">
        <span className="text-[11.5px] text-muted">{label}</span>
        <span className="inline-flex size-7 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
          <Icon name={icon} size={15} strokeWidth={1.7} />
        </span>
      </div>
      <div className="mt-2 font-mono text-[21px] font-semibold tracking-[-0.01em] text-heading">{value}</div>
      <div className="mt-1 flex items-center gap-1.5 text-[11px]">
        {delta === null ? (
          <span className="text-muted">vs previous 30 days</span>
        ) : (
          <>
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-semibold",
                delta >= 0 ? "text-success" : "text-error",
              )}
            >
              <Icon name={delta >= 0 ? "chevron-up" : "chevron-down"} size={12} strokeWidth={2.4} />
              {Math.abs(delta)}%
            </span>
            <span className="text-muted">vs previous 30 days</span>
          </>
        )}
      </div>
    </div>
  );
}

function QuickAction({ href, icon, label }: { href: string; icon: IconName; label: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-11 items-center gap-2.5 rounded-[var(--sz-admin-radius-control)] border border-line bg-canvas px-3 text-[12px] font-semibold text-body no-underline hover:border-accent hover:no-underline"
    >
      <span className="text-primary-700">
        <Icon name={icon} size={16} strokeWidth={1.8} />
      </span>
      {label}
    </Link>
  );
}
