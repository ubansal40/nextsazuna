import "server-only";

import type { RowDataPacket } from "mysql2";
import { query, queryOne } from "../db";
// Nepal-day ⇄ instant, the rule the coupon dates already use and check-coupons
// already pins — this screen's days are the shop's days, not UTC's.
import { startInstant, toDayInput } from "./coupon-rules";
import { SALE_PARAMS, SALE_SQL } from "./customers";
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
 * This imports that same test (`SALE_SQL`: the status denylist, plus refunded
 * payments) rather than restating it, so the two figures can never disagree
 * about what a sale is. (The previous version of this file excluded only
 * `cancelled`, which counted every unpaid and failed order as money earned. On
 * the live data that is 6 of 28 orders.)
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
 * `bucket` is interpolated into SQL, so it must never be reachable from a
 * request: `parsePeriod` narrows an arbitrary string to one of the three keys
 * below before anything here is read, and these are compile-time constants. No
 * user value is ever interpolated — the window instants, today's date, the sale
 * test's statuses and everything else are bound.
 *
 * Windows are aligned to calendar days rather than to `NOW()` so that the KPI
 * window and the chart's buckets describe exactly the same span; a rolling
 * `NOW() - INTERVAL 30 DAY` would slice today's first bucket in half.
 *
 * **The days are Nepal's.** `created_at` is a UTC instant, so `CURDATE()` and
 * `DATE(o.created_at)` filed every order placed between midnight and 05:45 in
 * Kathmandu under the day before — the night's orders landed in yesterday's
 * bar and a new month began at 05:45 on the 1st. Window starts are now the
 * instants Nepal's days begin, worked out here and bound, and orders are
 * bucketed by their Nepal date (`NEPAL_DAY`). That converts by offset rather
 * than by zone name: a MySQL without its zone tables loaded answers
 * `CONVERT_TZ(…, 'Asia/Kathmandu')` with NULL, and Nepal keeps no daylight
 * saving for a fixed offset to miss.
 */
interface PeriodSpec {
  readonly label: string;
  /** The window's first Nepal day, given Nepal's today — both `YYYY-MM-DD`. */
  readonly firstDay: (today: string) => string;
  /** The first day of the preceding window of the same span. */
  readonly prevFirstDay: (today: string) => string;
  readonly buckets: number;
  /** Yields 0 for the oldest bucket up to `buckets - 1` for the newest. Its one
   *  placeholder is Nepal's today. */
  readonly bucket: string;
  /** How a bucket index maps back to a date, for labelling. */
  readonly grain: "day" | "fiveDays" | "month";
}

/** An order's calendar day in Nepal (UTC+05:45). */
const NEPAL_DAY = "DATE(CONVERT_TZ(o.created_at, '+00:00', '+05:45'))";

const PERIODS: Record<DashboardPeriod, PeriodSpec> = {
  "7D": {
    label: "Last 7 days",
    firstDay: (today) => shiftDay(today, -6),
    prevFirstDay: (today) => shiftDay(today, -13),
    buckets: 7,
    bucket: `6 - DATEDIFF(?, ${NEPAL_DAY})`,
    grain: "day",
  },
  "30D": {
    label: "Last 30 days",
    firstDay: (today) => shiftDay(today, -29),
    prevFirstDay: (today) => shiftDay(today, -59),
    buckets: 6,
    bucket: `5 - FLOOR(DATEDIFF(?, ${NEPAL_DAY}) / 5)`,
    grain: "fiveDays",
  },
  "12M": {
    label: "Last 12 months",
    firstDay: (today) => monthStart(today, -11),
    prevFirstDay: (today) => monthStart(today, -23),
    buckets: 12,
    bucket: `11 - PERIOD_DIFF(DATE_FORMAT(?, '%Y%m'), DATE_FORMAT(${NEPAL_DAY}, '%Y%m'))`,
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

/** Orders that represent money actually earned — lifetime spend's own test.
 *  Its values are bound (`SALE_PARAMS`), never interpolated. */
const SALE = SALE_SQL;

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

  // Nepal's today, and each window as the instant its first day begins there.
  const now = new Date();
  const today = toDayInput(now);
  const start = startInstant(spec.firstDay(today))!;
  const prevStart = startInstant(spec.prevFirstDay(today))!;
  // The previous window stops as far into itself as this one has got. Measured
  // against the whole of the one before, a window still in progress read as a
  // slump every morning: 7D at 09:00 is six days and nine hours, and it was
  // being compared with seven full days.
  const prevEnd = new Date(prevStart.getTime() + (now.getTime() - start.getTime()));

  // Both windows in one pass, with the deltas and the average computed in SQL so
  // no rupee value is ever a JavaScript number. Aliases cannot be reused inside
  // the same SELECT, hence the derived table. Orders between `prevEnd` and
  // `start` are read but fall in neither window.
  const kpiRow = await queryOne<KpiRow>(
    `SELECT t.*,
            CASE WHEN t.prev_revenue > 0
                 THEN ROUND((t.cur_revenue - t.prev_revenue) / t.prev_revenue * 100, 1) END AS revenue_delta,
            CASE WHEN t.prev_orders > 0
                 THEN ROUND((t.cur_orders - t.prev_orders) / t.prev_orders * 100, 1) END    AS orders_delta,
            CASE WHEN t.cur_sale_orders > 0
                 THEN ROUND(t.cur_revenue / t.cur_sale_orders, 2) END                       AS aov
       FROM (
         SELECT COALESCE(SUM(CASE WHEN o.created_at >= ? AND ${SALE}
                                  THEN o.total_amount ELSE 0 END), 0)              AS cur_revenue,
                SUM(CASE WHEN o.created_at >= ? THEN 1 ELSE 0 END)                  AS cur_orders,
                SUM(CASE WHEN o.created_at >= ? AND ${SALE}
                         THEN 1 ELSE 0 END)                                        AS cur_sale_orders,
                COALESCE(SUM(CASE WHEN o.created_at < ? AND ${SALE}
                                  THEN o.total_amount ELSE 0 END), 0)              AS prev_revenue,
                SUM(CASE WHEN o.created_at < ? THEN 1 ELSE 0 END)                   AS prev_orders
           FROM orders o
          WHERE o.deleted_at IS NULL
            AND o.created_at >= ?
       ) t`,
    [start, ...SALE_PARAMS, start, start, ...SALE_PARAMS, prevEnd, ...SALE_PARAMS, prevEnd, prevStart],
  );

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
          AND o.created_at >= ?
          AND ${SALE}
        GROUP BY bucket
        ORDER BY bucket`,
      [today, start, ...SALE_PARAMS],
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
          AND o.created_at >= ?
          AND ${SALE}
        GROUP BY i.product_id, i.product_name
        ORDER BY revenue DESC
        LIMIT 4`,
      [start, ...SALE_PARAMS],
    ),
    // Newest first, every status — this panel is the operator's inbox, so an
    // order that failed payment is exactly the one they need to see. Dated by
    // its Nepal day, the same day the chart files it under.
    query<RecentRow>(
      `SELECT o.id, o.order_number, o.customer_name, o.total_amount,
              COALESCE(s.label, o.status)             AS status_label,
              s.colour                                AS colour,
              DATE_FORMAT(${NEPAL_DAY}, '%d %b')      AS date_label
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
 * Name a bucket from the same Nepal `today` the bucket query was given, so the
 * axis and the data it labels agree on the day: a chart whose axis disagrees
 * with its own data by a day is worse than no axis.
 *
 * The short forms are the spec's own vocabulary — weekday names at 7D, `Wk1…Wk6`
 * at 30D, month initials at 12M. Because a 30D bucket is five days rather than a
 * calendar week, the long `range` carries the real span, and that is what the
 * figures table and the chart's description use.
 */
function bucketNames(spec: PeriodSpec, index: number, today: string): { label: string; range: string } {
  const base = parseYmd(today);

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

/** A `YYYY-MM-DD` day moved by whole days — calendar arithmetic, no zone in it. */
function shiftDay(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The first day of the month `months` away from a `YYYY-MM-DD` day's month. */
function monthStart(day: string, months: number): string {
  const [y, m] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + months, 1)).toISOString().slice(0, 10);
}
