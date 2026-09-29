import "server-only";

import type { RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { query, transaction, type SqlParam } from "../db";
import { recordAdminAction } from "./audit";
import { escapeLike } from "./catalog";
// Nepal-day → instant, the rule the coupon dates already use and check-coupons
// already pins; a filter day means a day in Kathmandu, not in UTC.
import { expiryInstant, startInstant } from "./coupon-rules";
import { phoneDigits } from "./customers";
import { DELETED_ORDER_MESSAGE } from "./order-detail";
import { normaliseColour, type StatusColour } from "./order-status-colours";
import type { AdminContext } from "./rbac";

/**
 * The admin orders list.
 *
 * Soft delete is the rule: an order is a seven-year tax record, so
 * `deleted_at IS NULL` is baked into every read here rather than left to
 * callers to remember. Money stays a string end-to-end (ADR 0003) and is
 * formatted at the edge.
 *
 * The database sits ~320ms away, so this deliberately answers a whole page in a
 * fixed four round trips — statuses, tab counts, the page of orders, and one
 * thumbnail query for the page — instead of anything per-row.
 */

const PAGE_SIZE = 25;

/** A system status key (migration 0013), so it can be neither deleted nor re-keyed. */
const CANCELLED = "cancelled";

/** The sortable columns, mapped rather than interpolated from the request. */
const SORTS: Record<string, string> = {
  newest: "o.created_at DESC, o.id DESC",
  oldest: "o.created_at ASC, o.id ASC",
  total_desc: "o.total_amount DESC, o.id DESC",
  total_asc: "o.total_amount ASC, o.id DESC",
};

export interface AdminOrderFilters {
  /** A status key, or "all". */
  status?: string;
  search?: string;
  paymentStatus?: string;
  from?: string;
  to?: string;
  sort?: string;
  page?: number;
}

export interface AdminOrderRow {
  id: number;
  orderNumber: string;
  createdAt: string;
  customerName: string;
  phone: string;
  itemCount: number;
  thumbs: (string | null)[];
  total: string;
  currency: string;
  status: string;
  statusLabel: string;
  statusColour: StatusColour;
  paymentMethod: string;
  paymentStatus: string;
}

export interface AdminOrderPage {
  rows: AdminOrderRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** Order counts per status key, plus `all`, for the quick tabs. */
  tabCounts: Record<string, number>;
}

interface OrderDbRow extends RowDataPacket {
  id: number;
  order_number: string;
  created_at: Date | string;
  customer_name: string;
  phone: string;
  total_amount: string;
  currency: string;
  status: string;
  status_label: string | null;
  status_colour: string | null;
  payment_method: string;
  payment_status: string;
  item_count: number;
}

/** Build the shared WHERE for the list and its count. Every value is bound. */
function buildWhere(filters: AdminOrderFilters): { where: string; params: SqlParam[] } {
  const clauses = ["o.deleted_at IS NULL"];
  const params: SqlParam[] = [];

  if (filters.status && filters.status !== "all") {
    clauses.push("o.status = ?");
    params.push(filters.status);
  }
  if (filters.paymentStatus && filters.paymentStatus !== "all") {
    clauses.push("o.payment_status = ?");
    params.push(filters.paymentStatus);
  }
  // `created_at` is a UTC instant, so a day has to become the instants it spans
  // in Kathmandu — `'2026-08-09 00:00:00'` bound as-is would start the day at
  // 05:45 Nepal time and hand its first hours to the day before.
  const from = filters.from ? startInstant(filters.from) : null;
  if (from) {
    clauses.push("o.created_at >= ?");
    params.push(from);
  }
  const to = filters.to ? expiryInstant(filters.to) : null;
  if (to) {
    clauses.push("o.created_at <= ?");
    params.push(to);
  }

  const search = filters.search?.trim();
  if (search) {
    // `%` and `_` escaped, or a search for "_" matches every order. The promo
    // code is searched too — the coupon drawer sends admins here to find every
    // order that carries one.
    const like = `%${escapeLike(search)}%`;
    const matches = [
      "o.order_number LIKE ? ESCAPE '\\\\'",
      "o.customer_name LIKE ? ESCAPE '\\\\'",
      "o.coupon_code LIKE ? ESCAPE '\\\\'",
    ];
    params.push(like, like, like);
    // The phone is compared on digits alone, and on the last ten of them, so
    // "+977 9812345678" and "09812345678" find the order that stored
    // 9812345678 — the same rule the customer search uses.
    const digits = phoneDigits(search);
    if (digits.length >= 4) {
      matches.push("REGEXP_REPLACE(o.phone, '[^0-9]', '') LIKE ?");
      params.push(`%${digits}%`);
    }
    clauses.push(`(${matches.join(" OR ")})`);
  }

  return { where: clauses.join(" AND "), params };
}

/**
 * One page of rows. Items are counted by quantity, as the storefront's own
 * order history counts them — two rings on one line are two items.
 */
function pageOfOrders(where: string, params: SqlParam[], orderBy: string, page: number): Promise<OrderDbRow[]> {
  return query<OrderDbRow>(
    `SELECT o.id, o.order_number, o.created_at, o.customer_name, o.phone,
            o.total_amount, o.currency, o.status, o.payment_method, o.payment_status,
            s.label AS status_label, s.colour AS status_colour,
            (SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
       FROM orders o
       LEFT JOIN order_statuses s ON s.\`key\` = o.status
      WHERE ${where}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?`,
    [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE],
  );
}

export async function listAdminOrders(filters: AdminOrderFilters = {}): Promise<AdminOrderPage> {
  const requested = Math.max(1, Math.floor(Number(filters.page) || 1));
  const orderBy = SORTS[filters.sort ?? "newest"] ?? SORTS.newest;
  const { where, params } = buildWhere(filters);

  // The tab counts ignore the status filter — a tab has to show its own count
  // even while another tab is selected — but honour every other filter.
  const { where: tabWhere, params: tabParams } = buildWhere({ ...filters, status: "all" });

  const [firstRows, [countRow], tabRows] = await Promise.all([
    pageOfOrders(where, params, orderBy, requested),
    query<RowDataPacket & { n: number }>(`SELECT COUNT(*) AS n FROM orders o WHERE ${where}`, params),
    query<RowDataPacket & { status: string; n: number }>(
      `SELECT o.status, COUNT(*) AS n FROM orders o WHERE ${tabWhere} GROUP BY o.status`,
      tabParams,
    ),
  ]);

  // A bulk move or delete can empty the page the admin was on — the last page
  // of a tab they just cleared — and the list then read "page 3 of 2" over no
  // rows. The page is clamped to the last one that exists and re-read; the
  // extra round trip is paid only on that rare path, not on every load.
  const total = Number(countRow?.n ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requested, totalPages);
  const rows = page === requested ? firstRows : await pageOfOrders(where, params, orderBy, page);

  // One query for every thumbnail on the page rather than one per order.
  const ids = rows.map((r) => r.id);
  const thumbsByOrder = new Map<number, (string | null)[]>();
  if (ids.length > 0) {
    const thumbRows = await query<RowDataPacket & { order_id: number; image_url: string | null }>(
      `SELECT oi.order_id, p.image_url
         FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id IN (${ids.map(() => "?").join(",")})
        ORDER BY oi.id`,
      ids,
    );
    for (const row of thumbRows) {
      const list = thumbsByOrder.get(row.order_id) ?? [];
      if (list.length < 3) list.push(row.image_url);
      thumbsByOrder.set(row.order_id, list);
    }
  }

  const tabCounts: Record<string, number> = { all: 0 };
  for (const row of tabRows) {
    tabCounts[row.status] = Number(row.n);
    tabCounts.all += Number(row.n);
  }

  return {
    rows: rows.map((r) => ({
      id: r.id,
      orderNumber: r.order_number,
      createdAt: (r.created_at instanceof Date ? r.created_at : new Date(r.created_at)).toISOString(),
      customerName: r.customer_name,
      phone: r.phone,
      itemCount: Number(r.item_count),
      thumbs: thumbsByOrder.get(r.id) ?? [],
      total: r.total_amount,
      currency: r.currency,
      status: r.status,
      // A status row can be missing only if a key was removed out of band; the
      // key itself is a truthful last resort, and never a blank cell.
      statusLabel: r.status_label ?? r.status,
      statusColour: normaliseColour(r.status_colour),
      paymentMethod: r.payment_method,
      paymentStatus: r.payment_status,
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages,
    tabCounts,
  };
}

/**
 * Lock the orders a move is about to change, refusing if any has been deleted.
 *
 * A deleted order used to be skipped silently, so the detail page toasted "Moved
 * to Billed" over an order that had not moved. A single order says why; a bulk
 * selection only meets one when someone else deleted it after the list loaded.
 */
async function lockLiveOrders(
  connection: PoolConnection,
  ids: number[],
): Promise<(RowDataPacket & { id: number; status: string })[]> {
  const [rows] = await connection.execute<(RowDataPacket & { id: number; status: string; deleted_at: Date | null })[]>(
    `SELECT id, status, deleted_at FROM orders WHERE id IN (${ids.map(() => "?").join(",")}) FOR UPDATE`,
    ids,
  );
  if (rows.some((row) => row.deleted_at)) {
    throw new Error(
      ids.length === 1
        ? DELETED_ORDER_MESSAGE
        : "Some of these orders have been deleted since the list loaded. Reload it and try again.",
    );
  }
  return rows;
}

/**
 * Move one or more orders to a status, recording an activity row per order.
 *
 * Orders already on the target are skipped rather than logged — a bulk apply
 * over a mixed selection should not fill their feeds with "changed from Placed
 * to Placed".
 *
 * `cancelled` is refused here: it needs a reason and a `cancel` event, which is
 * `cancelOrders` below. Every other move clears `cancel_reason`, so an order
 * taken back out of Cancelled stops announcing why it was cancelled.
 */
export async function setOrdersStatus(
  admin: AdminContext,
  orderIds: number[],
  statusKey: string,
): Promise<number> {
  const ids = orderIds.filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) return 0;
  if (statusKey === CANCELLED) {
    throw new Error("Cancelling needs a reason, so it can’t be done as a plain status change.");
  }

  return transaction(async (connection) => {
    const [[status]] = await connection.execute<(RowDataPacket & { key: string; label: string })[]>(
      "SELECT `key`, label FROM order_statuses WHERE `key` = ? LIMIT 1",
      [statusKey],
    );
    if (!status) throw new Error("That status no longer exists.");

    const current = (await lockLiveOrders(connection, ids)).filter((row) => row.status !== statusKey);
    if (current.length === 0) return 0;

    const changing = current.map((r) => r.id);
    await connection.execute(
      `UPDATE orders SET status = ?, cancel_reason = NULL WHERE id IN (${changing.map(() => "?").join(",")})`,
      [statusKey, ...changing],
    );
    for (const row of current) {
      await connection.execute(
        `INSERT INTO order_activity (order_id, admin_id, admin_email, event_type, from_status, to_status)
         VALUES (?, ?, ?, 'status', ?, ?)`,
        [row.id, admin.id, admin.email, row.status, statusKey],
      );
    }

    await recordAdminAction(connection, admin, {
      action: "orders.status",
      resourceType: "orders",
      resourceId: changing.length === 1 ? changing[0] : null,
      metadata: { count: changing.length, to: statusKey },
    });
    return changing.length;
  });
}

/**
 * Cancel one or more orders, with a reason.
 *
 * The one way into `cancelled`: the detail page's button, a row's status
 * dropdown and the bulk bar all come here, so no cancellation can arrive as a
 * bare status change without a reason. The reason is stored on the order, not
 * just narrated in the feed, so a report can group by it later.
 */
export async function cancelOrders(
  admin: AdminContext,
  orderIds: number[],
  reason: string,
  note: string,
): Promise<number> {
  const ids = orderIds.filter((n) => Number.isInteger(n) && n > 0);
  const why = String(reason ?? "").trim().slice(0, 120);
  if (!why) throw new Error("Pick a reason before cancelling.");
  if (ids.length === 0) return 0;
  const detail = String(note ?? "").trim().slice(0, 400);
  const message = detail ? `${why} — ${detail}` : why;

  return transaction(async (connection) => {
    const current = (await lockLiveOrders(connection, ids)).filter((row) => row.status !== CANCELLED);
    if (current.length === 0) return 0;

    const changing = current.map((r) => r.id);
    await connection.execute(
      `UPDATE orders SET status = ?, cancel_reason = ? WHERE id IN (${changing.map(() => "?").join(",")})`,
      [CANCELLED, why, ...changing],
    );
    for (const row of current) {
      await connection.execute(
        `INSERT INTO order_activity (order_id, admin_id, admin_email, event_type, from_status, to_status, message)
         VALUES (?, ?, ?, 'cancel', ?, ?, ?)`,
        [row.id, admin.id, admin.email, row.status, CANCELLED, message],
      );
    }

    await recordAdminAction(connection, admin, {
      action: "orders.cancel",
      resourceType: "orders",
      resourceId: changing.length === 1 ? changing[0] : null,
      metadata:
        changing.length === 1
          ? { reason: why, from: current[0].status }
          : { reason: why, count: changing.length, ids: changing },
    });
    return changing.length;
  });
}

/**
 * Soft delete. Orders are never removed — this only hides them from the list.
 *
 * Each order gets a `delete` event in its own feed, and the audit entry names
 * every id: a bulk delete used to record only a count, which left no way to say
 * which tax records had been hidden, or to find them again to restore.
 */
export async function softDeleteOrders(admin: AdminContext, orderIds: number[]): Promise<number> {
  const ids = orderIds.filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) return 0;
  return transaction(async (connection) => {
    const [live] = await connection.execute<(RowDataPacket & { id: number })[]>(
      `SELECT id FROM orders WHERE id IN (${ids.map(() => "?").join(",")}) AND deleted_at IS NULL FOR UPDATE`,
      ids,
    );
    if (live.length === 0) return 0;

    const deleting = live.map((row) => row.id);
    await connection.execute(
      `UPDATE orders SET deleted_at = NOW() WHERE id IN (${deleting.map(() => "?").join(",")})`,
      deleting,
    );
    for (const id of deleting) {
      await connection.execute(
        `INSERT INTO order_activity (order_id, admin_id, admin_email, event_type, message)
         VALUES (?, ?, ?, 'delete', 'Order deleted')`,
        [id, admin.id, admin.email],
      );
    }
    await recordAdminAction(connection, admin, {
      action: "orders.delete",
      resourceType: "orders",
      resourceId: deleting.length === 1 ? deleting[0] : null,
      metadata: { count: deleting.length, ids: deleting },
    });
    return deleting.length;
  });
}
