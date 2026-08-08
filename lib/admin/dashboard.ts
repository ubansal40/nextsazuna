import "server-only";

import type { RowDataPacket } from "mysql2";
import { query, queryOne } from "../db";

/**
 * Admin dashboard data — Sazuna Admin.dc.html §Dashboard.
 *
 * The landing's three KPIs and its recent-orders feed, read straight from the
 * orders table. A cancelled order is not revenue, so it is excluded from both
 * the money and the count; every other order in the window counts.
 *
 * The chart and top-products panels the mock also shows are a follow-up — these
 * are the numbers an operator opens the console to see first.
 */

const REALIZED = "status <> 'cancelled'";
const WINDOW_DAYS = 30;

export interface DashboardKpis {
  /** Money as strings — never parsed to a float on the way here (ADR 0003). */
  revenue: string;
  orders: number;
  /** Average order value, rounded for display only. */
  aov: number;
  /** Percent change vs the previous equal window; null when there is no base. */
  revenueDelta: number | null;
  ordersDelta: number | null;
}

export interface RecentOrder {
  orderNumber: string;
  customerName: string;
  status: string;
  paymentStatus: string;
  total: string;
  createdAt: string;
}

interface KpiRow extends RowDataPacket {
  cur_revenue: string | null;
  cur_orders: number;
  prev_revenue: string | null;
  prev_orders: number;
}

interface RecentRow extends RowDataPacket {
  order_number: string;
  customer_name: string;
  status: string;
  payment_status: string;
  total_amount: string;
  created_at: string;
}

function pctDelta(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export async function getDashboard(): Promise<{ kpis: DashboardKpis; recent: RecentOrder[] }> {
  const row = await queryOne<KpiRow>(
    `SELECT
        SUM(CASE WHEN created_at >= NOW() - INTERVAL ? DAY THEN total_amount ELSE 0 END) AS cur_revenue,
        SUM(CASE WHEN created_at >= NOW() - INTERVAL ? DAY THEN 1 ELSE 0 END)            AS cur_orders,
        SUM(CASE WHEN created_at >= NOW() - INTERVAL ? DAY AND created_at < NOW() - INTERVAL ? DAY
                 THEN total_amount ELSE 0 END)                                          AS prev_revenue,
        SUM(CASE WHEN created_at >= NOW() - INTERVAL ? DAY AND created_at < NOW() - INTERVAL ? DAY
                 THEN 1 ELSE 0 END)                                                     AS prev_orders
       FROM orders
      WHERE ${REALIZED}
        AND created_at >= NOW() - INTERVAL ? DAY`,
    [WINDOW_DAYS, WINDOW_DAYS, WINDOW_DAYS * 2, WINDOW_DAYS, WINDOW_DAYS * 2, WINDOW_DAYS, WINDOW_DAYS * 2],
  );

  const curRevenue = row?.cur_revenue ?? "0";
  const curOrders = Number(row?.cur_orders ?? 0);
  const prevRevenue = Number(row?.prev_revenue ?? 0);
  const prevOrders = Number(row?.prev_orders ?? 0);
  const aov = curOrders > 0 ? Number(curRevenue) / curOrders : 0;

  const recentRows = await query<RecentRow>(
    `SELECT order_number, customer_name, status, payment_status, total_amount,
            DATE_FORMAT(created_at, '%Y-%m-%d') AS created_at
       FROM orders
      ORDER BY created_at DESC
      LIMIT 8`,
  );

  return {
    kpis: {
      revenue: curRevenue,
      orders: curOrders,
      aov,
      revenueDelta: pctDelta(Number(curRevenue), prevRevenue),
      ordersDelta: pctDelta(curOrders, prevOrders),
    },
    recent: recentRows.map((r) => ({
      orderNumber: r.order_number,
      customerName: r.customer_name,
      status: r.status,
      paymentStatus: r.payment_status,
      total: r.total_amount,
      createdAt: r.created_at,
    })),
  };
}
