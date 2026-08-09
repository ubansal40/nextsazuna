import "server-only";

import type { RowDataPacket } from "mysql2";
import { query, queryOne } from "../db";
import { NON_SPEND_STATUSES } from "./customers";
import { normaliseColour, type StatusColour } from "./order-status-colours";

/**
 * Admin dashboard data — Sazuna Admin.dc.html §Dashboard.
 *
 * The landing every admin sees: three KPIs for the chosen period, revenue over
 * time, the newest orders, and the products actually earning. Everything is read
 * from live orders; nothing here is seeded or sampled.
 *
 * Two decisions carry the weight of this file.
 *
 * **Revenue is a denylist, not a sum of everything.** Order statuses are
 * configurable (migration 0013), so an allowlist of "statuses that count as a
 * sale" would value every newly-added status at zero the moment someone adds
 * one — the trap `lib/admin/customers.ts` already avoids for lifetime spend.
 * This imports that same `NON_SPEND_STATUSES` rather than restating it, so the
 * two figures can never disagree about what a sale is. (The previous version of
 * this file excluded only `cancelled`, which counted every unpaid and failed
 * order as money earned. On the live data that is 6 of 28 orders.)
 *
 * **Money never becomes a number.** Every total, average and percentage change
 * is computed by MySQL and arrives as a `DECIMAL` string (ADR 0003), so no
 * figure on this screen has been through a float. The one exception is the chart
 * geometry, which is arithmetic on pixels: the bar heights are derived from
 * numbers, but every rupee value the page *prints* comes from the string.
 */

export const DASHBOARD_PERIODS = ["7D", "30D", "12M"] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

/**
 * The window definitions, keyed by the spec's own period tokens.
 *
 * `start`, `prevStart` and `bucket` are interpolated into SQL, so they must
 * never be reachable from a request: `parsePeriod` narrows an arbitrary string
 * to one of the three keys below before anything here is read, and these are
 * compile-time constants. No user value is ever interpolated — the status
 * denylist and everything else is bound.
 *
 * Windows are aligned to calendar days rather than to `NOW()` so that the KPI
 * window and the chart's buckets describe exactly the same span; a rolling
 * `NOW() - INTERVAL 30 DAY` would slice today's first bucket in half.
 */
interface PeriodSpec {
  readonly label: string;
  /** First instant of the window. */
  readonly start: string;
  /** First instant of the preceding, equally long window. */
  readonly prevStart: string;
  readonly buckets: number;
  /** Yields 0 for the oldest bucket up to `buckets - 1` for the newest. */
  readonly bucket: string;
  /** How a bucket index maps back to a date, for labelling. */
  readonly grain: "day" | "fiveDays" | "month";
}

const PERIODS: Record<DashboardPeriod, PeriodSpec> = {
  "7D": {
    label: "Last 7 days",
    start: "CURDATE() - INTERVAL 6 DAY",
    prevStart: "CURDATE() - INTERVAL 13 DAY",
    buckets: 7,
    bucket: "6 - DATEDIFF(CURDATE(), DATE(o.created_at))",
    grain: "day",
  },
  "30D": {
    label: "Last 30 days",
    start: "CURDATE() - INTERVAL 29 DAY",
    prevStart: "CURDATE() - INTERVAL 59 DAY",
    buckets: 6,
    bucket: "5 - FLOOR(DATEDIFF(CURDATE(), DATE(o.created_at)) / 5)",
    grain: "fiveDays",
  },
  "12M": {
    label: "Last 12 months",
    start: "DATE_FORMAT(CURDATE() - INTERVAL 11 MONTH, '%Y-%m-01')",
    prevStart: "DATE_FORMAT(CURDATE() - INTERVAL 23 MONTH, '%Y-%m-01')",
    buckets: 12,
    bucket: "11 - PERIOD_DIFF(DATE_FORMAT(CURDATE(), '%Y%m'), DATE_FORMAT(o.created_at, '%Y%m'))",
    grain: "month",
  },
};

export const DEFAULT_PERIOD: DashboardPeriod = "30D";

/** The human name for a period — the spec's `periodLabel`. */
export function periodLabel(period: DashboardPeriod): string {
  return PERIODS[period].label;
}

/** Narrow a query-string value to a period. Anything unrecognised is the default. */
export function parsePeriod(raw: string | string[] | undefined): DashboardPeriod {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (DASHBOARD_PERIODS as readonly string[]).includes(value ?? "")
    ? (value as DashboardPeriod)
    : DEFAULT_PERIOD;
}

/** Orders that represent money actually earned. Bound, never interpolated. */
const SALE = `o.status NOT IN (${NON_SPEND_STATUSES.map(() => "?").join(",")})`;
const SALE_PARAMS: string[] = [...NON_SPEND_STATUSES];

export interface DashboardKpis {
  /** Money as a string, and null when the viewer may not see money. */
  revenue: string | null;
  /** Every order placed in the window, whatever its status. */
  orders: number;
  /** The subset that counts as a sale — the denominator behind `aov`. */
  saleOrders: number;
  /** Revenue ÷ sale orders, as a string. Null when there were none. */
  aov: string | null;
  /** Percent change vs the previous equal window, e.g. `"12.4"` / `"-3.1"`.
   *  Null when the previous window had nothing to compare against. */
  revenueDelta: string | null;
  ordersDelta: string | null;
}

export interface ChartBucket {
  /** Short axis tick — `Mon`, `Wk3`, `A`. */
  label: string;
  /** The span in words, for the figures table and the chart description. */
  range: string;
  revenue: string;
  orders: number;
}

export interface TopProduct {
  productId: number | null;
  name: string;
  sku: string | null;
  units: number;
  revenue: string;
}

export interface RecentOrder {
  id: number;
  orderNumber: string;
  customerName: string;
  total: string;
  statusLabel: string;
  colour: StatusColour;
  /** Already formatted by MySQL as `18 Jul`, so the two sides agree on the day. */
  dateLabel: string;
}

export interface DashboardData {
  period: DashboardPeriod;
  periodLabel: string;
  kpis: DashboardKpis;
  /** Revenue per bucket, oldest first. Null when the viewer may not see money —
   *  the spec's `showChart`. */
  chart: ChartBucket[] | null;
  /** Null for the same reason — the spec's `showTop`. */
  top: TopProduct[] | null;
  recent: RecentOrder[];
}

interface KpiRow extends RowDataPacket {
  today: string;
  cur_revenue: string;
  cur_orders: string;
  cur_sale_orders: string;
  prev_revenue: string;
  prev_orders: string;
  revenue_delta: string | null;
  orders_delta: string | null;
  aov: string | null;
}

interface BucketRow extends RowDataPacket {
  bucket: number;
  revenue: string;
  orders: string;
}

interface TopRow extends RowDataPacket {
  product_id: number | null;
  product_name: string;
  sku: string | null;
  units: string;
  revenue: string;
}

interface RecentRow extends RowDataPacket {
  id: number;
  order_number: string;
  customer_name: string;
  total_amount: string;
  status_label: string;
  colour: string | null;
  date_label: string;
}

/**
 * Read the dashboard.
 *
 * `money: false` is the spec's limited role — it filters the KPI row down to the
 * order count and drops the chart and top-products panels. It is enforced by not
 * running those queries at all, so a figure the viewer may not see never leaves
 * the database.
 */
export async function getDashboard(
  period: DashboardPeriod,
  { money }: { money: boolean },
): Promise<DashboardData> {
  const spec = PERIODS[period];

  // Both windows in one pass, with the deltas and the average computed in SQL so
  // no rupee value is ever a JavaScript number. Aliases cannot be reused inside
  // the same SELECT, hence the derived table.
  const kpiRow = await queryOne<KpiRow>(
    `SELECT t.*,
            CASE WHEN t.prev_revenue > 0
                 THEN ROUND((t.cur_revenue - t.prev_revenue) / t.prev_revenue * 100, 1) END AS revenue_delta,
            CASE WHEN t.prev_orders > 0
                 THEN ROUND((t.cur_orders - t.prev_orders) / t.prev_orders * 100, 1) END    AS orders_delta,
            CASE WHEN t.cur_sale_orders > 0
                 THEN ROUND(t.cur_revenue / t.cur_sale_orders, 2) END                       AS aov
       FROM (
         SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today,
                COALESCE(SUM(CASE WHEN o.created_at >= ${spec.start} AND ${SALE}
                                  THEN o.total_amount ELSE 0 END), 0)              AS cur_revenue,
                SUM(CASE WHEN o.created_at >= ${spec.start} THEN 1 ELSE 0 END)      AS cur_orders,
                SUM(CASE WHEN o.created_at >= ${spec.start} AND ${SALE}
                         THEN 1 ELSE 0 END)                                        AS cur_sale_orders,
                COALESCE(SUM(CASE WHEN o.created_at < ${spec.start} AND ${SALE}
                                  THEN o.total_amount ELSE 0 END), 0)              AS prev_revenue,
                SUM(CASE WHEN o.created_at < ${spec.start} THEN 1 ELSE 0 END)       AS prev_orders
           FROM orders o
          WHERE o.deleted_at IS NULL
            AND o.created_at >= ${spec.prevStart}
       ) t`,
    [...SALE_PARAMS, ...SALE_PARAMS, ...SALE_PARAMS],
  );

  const today = kpiRow?.today ?? null;

  const kpis: DashboardKpis = {
    revenue: money ? (kpiRow?.cur_revenue ?? "0") : null,
    orders: Number(kpiRow?.cur_orders ?? 0),
    saleOrders: Number(kpiRow?.cur_sale_orders ?? 0),
    aov: money ? (kpiRow?.aov ?? null) : null,
    revenueDelta: money ? (kpiRow?.revenue_delta ?? null) : null,
    ordersDelta: kpiRow?.orders_delta ?? null,
  };

  if (!money) {
    return { period, periodLabel: spec.label, kpis, chart: null, top: null, recent: [] };
  }

  const [bucketRows, topRows, recentRows] = await Promise.all([
    // GROUP BY an alias is fine in MySQL, and keeps the bucket expression in one place.
    query<BucketRow>(
      `SELECT ${spec.bucket} AS bucket,
              COALESCE(SUM(o.total_amount), 0) AS revenue,
              COUNT(*)                         AS orders
         FROM orders o
        WHERE o.deleted_at IS NULL
          AND o.created_at >= ${spec.start}
          AND ${SALE}
        GROUP BY bucket
        ORDER BY bucket`,
      SALE_PARAMS,
    ),
    // Grouped by name as well as id: a custom line has no product_id, and every
    // one of them would otherwise collapse into a single phantom "product".
    query<TopRow>(
      `SELECT i.product_id, i.product_name, MAX(i.product_sku) AS sku,
              SUM(i.quantity)   AS units,
              SUM(i.line_total) AS revenue
         FROM order_items i
         JOIN orders o ON o.id = i.order_id
        WHERE o.deleted_at IS NULL
          AND o.created_at >= ${spec.start}
          AND ${SALE}
        GROUP BY i.product_id, i.product_name
        ORDER BY revenue DESC
        LIMIT 4`,
      SALE_PARAMS,
    ),
    // Newest first, every status — this panel is the operator's inbox, so an
    // order that failed payment is exactly the one they need to see.
    query<RecentRow>(
      `SELECT o.id, o.order_number, o.customer_name, o.total_amount,
              COALESCE(s.label, o.status)             AS status_label,
              s.colour                                AS colour,
              DATE_FORMAT(o.created_at, '%d %b')      AS date_label
         FROM orders o
         LEFT JOIN order_statuses s ON s.\`key\` = o.status
        WHERE o.deleted_at IS NULL
        ORDER BY o.created_at DESC, o.id DESC
        LIMIT 5`,
    ),
  ]);

  const revenueByBucket = new Map(bucketRows.map((r) => [Number(r.bucket), r]));
  const buckets: ChartBucket[] = Array.from({ length: spec.buckets }, (_, i) => {
    const row = revenueByBucket.get(i);
    return {
      ...bucketNames(spec, i, today),
      revenue: row?.revenue ?? "0",
      orders: Number(row?.orders ?? 0),
    };
  });

  return {
    period,
    periodLabel: spec.label,
    kpis,
    chart: buckets,
    top: topRows.map((r) => ({
      productId: r.product_id,
      name: r.product_name,
      sku: r.sku,
      units: Number(r.units),
      revenue: r.revenue,
    })),
    recent: recentRows.map((r) => ({
      id: r.id,
      orderNumber: r.order_number,
      customerName: r.customer_name,
      total: r.total_amount,
      statusLabel: r.status_label,
      colour: normaliseColour(r.colour),
      dateLabel: r.date_label,
    })),
  };
}

/**
 * Name a bucket, from the database's idea of today rather than the app server's.
 * The two can sit in different time zones, and a chart whose axis disagrees with
 * its own data by a day is worse than no axis.
 *
 * The short forms are the spec's own vocabulary — weekday names at 7D, `Wk1…Wk6`
 * at 30D, month initials at 12M. Because a 30D bucket is five days rather than a
 * calendar week, the long `range` carries the real span, and that is what the
 * figures table and the chart's description use.
 */
function bucketNames(spec: PeriodSpec, index: number, today: string | null): { label: string; range: string } {
  const base = today ? parseYmd(today) : new Date();

  if (spec.grain === "day") {
    const day = addDays(base, index - (spec.buckets - 1));
    return {
      label: day.toLocaleDateString("en-GB", { weekday: "short" }),
      range: day.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }),
    };
  }

  if (spec.grain === "fiveDays") {
    const end = addDays(base, -5 * (spec.buckets - 1 - index));
    const start = addDays(end, -4);
    const short = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    return { label: `Wk${index + 1}`, range: `${short(start)} – ${short(end)}` };
  }

  const month = new Date(base.getFullYear(), base.getMonth() - (spec.buckets - 1 - index), 1);
  return {
    label: month.toLocaleDateString("en-GB", { month: "narrow" }),
    range: month.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
  };
}

/** `2026-08-09` as a local date — `new Date(string)` would read it as UTC. */
function parseYmd(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function addDays(from: Date, days: number): Date {
  return new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
}
