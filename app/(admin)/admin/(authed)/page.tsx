import type { Metadata } from "next";
import Link from "next/link";
import { Icon, type IconName } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { requireAdmin } from "@/lib/admin/require";
import { authorizeSection } from "@/lib/admin/rbac";
import {
  DASHBOARD_PERIODS,
  getDashboard,
  parsePeriod,
  periodLabel,
  type ChartBucket,
  type DashboardPeriod,
  type RecentOrder,
  type TopProduct,
} from "@/lib/admin/dashboard";
import { STATUS_CHIP } from "./orders/_components/status-badge";

/**
 * Admin dashboard — Sazuna Admin.dc.html §Dashboard.
 *
 * The landing every admin sees: the period switcher, three KPIs, revenue over
 * time, the newest orders, the products earning, and the actions an operator
 * reaches for first.
 *
 * **No section gate, by design.** `requireAdmin` is the only guard, because this
 * is also where `requireSection` bounces a staffer who lacks a grant — gating it
 * would make that bounce a redirect loop. What it shows is gated instead: the
 * spec's limited role sees the order count and nothing derived from money, which
 * here means an admin without the `orders` grant. The figures they may not see
 * are never queried, so the gate is on the data and not just the markup.
 *
 * **It is a Server Component, and the period lives in the URL.** The switcher is
 * three links rather than client state, so choosing a period costs no JavaScript,
 * survives a refresh and can be linked to.
 */

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

/** The chart's drawing box — the spec's own constants, kept as one unit. */
const CHART = { w: 680, h: 200, pad: 8 } as const;

function firstName(name: string | null, email: string): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed.split(/\s+/)[0];
  return email.split("@")[0];
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  const [admin, params] = await Promise.all([requireAdmin(), searchParams]);
  const period = parsePeriod(params.period);
  // The spec's `limited` role, in this app's vocabulary: money on this screen is
  // all order money, so the orders grant is what decides whether it is shown.
  const money = authorizeSection(admin, "orders");
  const data = await getDashboard(period, { money });

  return (
    <div className="mx-auto max-w-[1100px]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3.5">
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-medium text-heading">
            Namaste, {firstName(admin.name, admin.email)}
          </h2>
          <p className="mt-1 text-[12.5px] text-muted">{data.periodLabel}</p>
        </div>
        <PeriodSwitcher current={period} />
      </div>

      {/* KPIs. The spec shows the limited role the order count alone — one card,
        * held to a card's width rather than stretched across the page. */}
      {/* The spec's three tiers: 3-up, 2-up below 1000, stacked below 760.
          The inferred version jumped 1 -> 3 at 640 and skipped the 2-up
          band entirely, which is exactly where a tablet sits. */}
      <div className={cn("grid gap-[13px]", money ? "min-[761px]:grid-cols-2 min-[1001px]:grid-cols-3" : "sm:max-w-[340px]")}>
        {money && (
          <Kpi
            label="Revenue"
            icon="wallet"
            value={formatPrice(data.kpis.revenue) ?? "रु 0"}
            delta={data.kpis.revenueDelta}
          />
        )}
        <Kpi label="Orders" icon="order-bag" value={String(data.kpis.orders)} delta={data.kpis.ordersDelta} />
        {money && (
          <Kpi
            label="AOV"
            icon="receipt"
            value={formatPrice(data.kpis.aov) ?? "—"}
            delta={null}
            sub="per counted order"
          />
        )}
      </div>

      {/* Only worth saying when the two counts actually differ — but when they do
        * it is worth saying loudly, because the gap is the difference between
        * "orders taken" and "money earned". */}
      {money && data.kpis.saleOrders !== data.kpis.orders && (
        <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
          Revenue and AOV count {data.kpis.saleOrders} of these {data.kpis.orders} orders — the rest are pending
          payment, failed or cancelled.
        </p>
      )}

      {data.chart && <RevenueChart buckets={data.chart} periodLabel={data.periodLabel} period={period} />}

      {/* Spec: `1fr 330px`, not a ratio — the side column is a fixed rail so the
          chart takes every remaining pixel. Collapses to one column at 1000. */}
      {money && (
        <div className="mt-3.5 grid items-start gap-[15px] min-[1001px]:grid-cols-[minmax(0,1fr)_330px]">
          <RecentOrders rows={data.recent} />
          {data.top && <TopProducts rows={data.top} />}
        </div>
      )}

      <QuickActions admin={admin} />
    </div>
  );
}

/* ---------------------------------------------------------------- period ---- */

function PeriodSwitcher({ current }: { current: DashboardPeriod }) {
  return (
    <nav aria-label="Dashboard period" className="flex items-center gap-0.5 rounded-pill border border-line bg-raised p-0.5">
      {DASHBOARD_PERIODS.map((value) => {
        const on = value === current;
        return (
          <Link
            key={value}
            href={`/admin?period=${value}`}
            aria-current={on ? "page" : undefined}
            aria-label={periodLabel(value)}
            className={cn(
              "inline-flex min-h-9 items-center rounded-pill px-3 font-mono text-[11.5px] font-semibold no-underline hover:no-underline",
              on ? "bg-primary-700 text-white" : "text-muted hover:text-heading",
            )}
          >
            {value}
          </Link>
        );
      })}
    </nav>
  );
}

/* ------------------------------------------------------------------- KPI ---- */

/** `"12.4"` / `"-3.1"` / `"0.0"` → the arrow, the tone and the magnitude. */
function readDelta(delta: string): { tone: "up" | "down" | "flat"; magnitude: string } {
  if (/^-?0(\.0+)?$/.test(delta)) return { tone: "flat", magnitude: "0" };
  return { tone: delta.startsWith("-") ? "down" : "up", magnitude: delta.replace(/^-/, "") };
}

function Kpi({
  label,
  icon,
  value,
  delta,
  sub,
}: {
  label: string;
  icon: IconName;
  value: string;
  delta: string | null;
  /** Replaces the comparison caption for a KPI that has no period-over-period
   *  reading of its own — an average is not a total, so a percentage change on
   *  it would invite the wrong comparison. */
  sub?: string;
}) {
  const read = delta === null ? null : readDelta(delta);
  const caption =
    sub ??
    (read === null
      ? "no earlier period to compare"
      : read.tone === "flat"
        ? "no change vs last period"
        : "vs last period");
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
        {read && read.tone !== "flat" && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-semibold",
              read.tone === "up" ? "text-success" : "text-error",
            )}
          >
            <Icon name={read.tone === "up" ? "chevron-up" : "chevron-down"} size={12} strokeWidth={2.4} />
            {read.magnitude}%
          </span>
        )}
        <span className="text-muted">{caption}</span>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- chart ---- */

/**
 * Revenue over time, drawn as inline SVG.
 *
 * No charting library: the ceremony system is token-based, and a library would
 * arrive with its own palette, its own type scale and its own DOM to fight. The
 * geometry is the spec's — a 680×200 box, 8px of padding, the peak set to 115%
 * of the largest bucket so the line never touches the ceiling.
 *
 * The numbers are readable three ways: the shape, the accessible description,
 * and the figures table underneath. Only the pixel coordinates are computed from
 * numbers — every rupee value printed here comes from its `DECIMAL` string.
 */
function RevenueChart({
  buckets,
  periodLabel,
  period,
}: {
  buckets: ChartBucket[];
  periodLabel: string;
  period: DashboardPeriod;
}) {
  const { w, h, pad } = CHART;
  const values = buckets.map((b) => Number(b.revenue));
  const largest = Math.max(...values, 0);
  // A period with no sales would divide by zero; flatten it onto the baseline.
  const ceiling = largest > 0 ? largest * 1.15 : 1;
  const stepX = (w - pad * 2) / (buckets.length - 1);
  const points = values.map((v, i) => [pad + i * stepX, h - pad - (v / ceiling) * (h - pad * 2)] as const);

  const line = points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${points[points.length - 1][0].toFixed(1)} ${h} L${points[0][0].toFixed(1)} ${h} Z`;

  const peakIndex = values.indexOf(largest);
  const description =
    largest > 0
      ? `Revenue by ${grainWord(period)} over the ${periodLabel.toLowerCase()}, ` +
        `peaking at ${formatPrice(buckets[peakIndex].revenue)} in ${buckets[peakIndex].range}.`
      : `No revenue in the ${periodLabel.toLowerCase()}.`;

  return (
    <section
      aria-labelledby="dash-chart-title"
      className="mt-3.5 rounded-[var(--sz-admin-radius-card)] border border-line bg-raised p-4"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="dash-chart-title" className="text-[13.5px] font-semibold text-heading">
          Revenue over time
        </h3>
        <p className="font-mono text-[11px] text-muted">{periodLabel}</p>
      </div>

      <svg
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={description}
        className="block h-auto w-full"
      >
        <title>{description}</title>
        <path d={area} className="fill-primary-700/10" />
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} className="stroke-line" strokeWidth={1} />
        <path
          d={line}
          fill="none"
          className="stroke-primary-700"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={2.5} className="fill-primary-700" />
        ))}
      </svg>

      <div className="mt-1.5 flex justify-between gap-1">
        {buckets.map((bucket) => (
          <span key={bucket.range} className="font-mono text-[10px] text-muted">
            {bucket.label}
          </span>
        ))}
      </div>

      <details className="mt-3 border-t border-line-soft pt-2.5">
        <summary className="cursor-pointer text-[12px] font-semibold text-primary-700">Show the figures</summary>
        <table className="mt-2.5 w-full text-[12px]">
          <caption className="sr-only">Revenue and order count for each {grainWord(period)}</caption>
          <thead>
            <tr className="border-b border-line-soft text-left text-[11px] text-muted">
              <th scope="col" className="py-1.5 pr-3 font-medium">
                Period
              </th>
              <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                Orders
              </th>
              <th scope="col" className="py-1.5 text-right font-medium">
                Revenue
              </th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((bucket) => (
              <tr key={bucket.range} className="border-b border-line-soft last:border-0">
                <td className="py-1.5 pr-3 text-body">{bucket.range}</td>
                <td className="py-1.5 pr-3 text-right font-mono text-muted">{bucket.orders}</td>
                <td className="py-1.5 text-right font-mono text-heading">{formatPrice(bucket.revenue) ?? "रु 0"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

function grainWord(period: DashboardPeriod): string {
  if (period === "7D") return "day";
  if (period === "12M") return "month";
  return "five-day period";
}

/* ------------------------------------------------------------- the panels ---- */

function RecentOrders({ rows }: { rows: RecentOrder[] }) {
  return (
    <section className="overflow-hidden rounded-[var(--sz-admin-radius-card)] border border-line bg-raised">
      <div className="flex items-center justify-between border-b border-line-soft px-4 py-3.5">
        <h3 className="text-[13.5px] font-semibold text-heading">Recent orders</h3>
        <Link href="/admin/orders" className="px-1 text-xs font-semibold text-primary-700 no-underline hover:underline">
          View all
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-[13px] text-muted">No orders yet.</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {rows.map((order) => (
            <li key={order.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
              <Link
                href={`/admin/orders/${order.id}`}
                className="font-mono text-[12.5px] font-semibold text-primary-700 underline underline-offset-2"
              >
                {order.orderNumber}
              </Link>
              <span className="min-w-0 flex-1 truncate text-[13px] text-body">{order.customerName}</span>
              <span
                className={cn(
                  "inline-flex rounded-pill border px-2.5 py-0.5 text-[11px] font-semibold",
                  STATUS_CHIP[order.colour],
                )}
              >
                {order.statusLabel}
              </span>
              <span className="whitespace-nowrap font-mono text-[12.5px] font-semibold text-heading">
                {formatPrice(order.total) ?? "—"}
              </span>
              <span className="whitespace-nowrap font-mono text-[11px] text-muted">{order.dateLabel}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TopProducts({ rows }: { rows: TopProduct[] }) {
  return (
    <section className="overflow-hidden rounded-[var(--sz-admin-radius-card)] border border-line bg-raised">
      <div className="border-b border-line-soft px-4 py-3.5">
        <h3 className="text-[13.5px] font-semibold text-heading">Top products</h3>
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-[13px] text-muted">Nothing sold in this period.</p>
      ) : (
        <ol className="divide-y divide-line-soft">
          {rows.map((product, i) => (
            <li key={`${product.productId ?? "custom"}-${product.name}`} className="flex items-center gap-3 px-4 py-3">
              <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-surface font-mono text-[11px] font-semibold text-muted">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium text-heading">{product.name}</span>
                <span className="font-mono text-[10.5px] text-muted">
                  {product.sku ? `${product.sku} · ` : ""}
                  {product.units} sold
                </span>
              </span>
              <span className="whitespace-nowrap font-mono text-[12.5px] font-semibold text-heading">
                {formatPrice(product.revenue) ?? "—"}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/* --------------------------------------------------------- quick actions ---- */

const ACTIONS: { href: string; icon: IconName; label: string; section: string }[] = [
  { href: "/admin/products/new", icon: "plus", label: "Add product", section: "products" },
  { href: "/admin/orders", icon: "order-bag", label: "View orders", section: "orders" },
  { href: "/admin/stock", icon: "box", label: "Update stock", section: "products_stock" },
  { href: "/admin/customers", icon: "users", label: "Customers", section: "customers" },
];

/** Only the actions this admin can actually reach — a shortcut to a page that
 *  would bounce them straight back here is worse than no shortcut. */
function QuickActions({ admin }: { admin: Parameters<typeof authorizeSection>[0] }) {
  const actions = ACTIONS.filter((action) => authorizeSection(admin, action.section));
  if (actions.length === 0) return null;

  return (
    <div className="mt-3.5 rounded-[var(--sz-admin-radius-card)] border border-line bg-raised p-4">
      <h3 className="mb-3 text-[12.5px] font-semibold text-heading">Quick actions</h3>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {actions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="flex min-h-11 items-center gap-2.5 rounded-[var(--sz-admin-radius-control)] border border-line bg-canvas px-3 text-[12px] font-semibold text-body no-underline hover:border-accent hover:no-underline"
          >
            <span className="text-primary-700">
              <Icon name={action.icon} size={16} strokeWidth={1.8} />
            </span>
            {action.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
