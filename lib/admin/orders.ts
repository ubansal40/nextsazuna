import "server-only";

import type { RowDataPacket } from "mysql2";
import { query, transaction } from "../db";
import { recordAdminAction } from "./audit";
import { escapeLike } from "./catalog";
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
function buildWhere(filters: AdminOrderFilters): { where: string; params: (string | number)[] } {
  const clauses = ["o.deleted_at IS NULL"];
  const params: (string | number)[] = [];

  if (filters.status && filters.status !== "all") {
    clauses.push("o.status = ?");
    params.push(filters.status);
  }
  if (filters.paymentStatus && filters.paymentStatus !== "all") {
    clauses.push("o.payment_status = ?");
    params.push(filters.paymentStatus);
  }
  if (filters.from) {
    clauses.push("o.created_at >= ?");
    params.push(`${filters.from} 00:00:00`);
  }
  if (filters.to) {
    clauses.push("o.created_at <= ?");
    params.push(`${filters.to} 23:59:59`);
  }

  const search = filters.search?.trim();
  if (search) {
    // `%` and `_` escaped, or a search for "_" matches every order. The phone
    // is compared on digits alone so a number typed with +977 or spaces still
    // finds its order.
    const like = `%${escapeLike(search)}%`;
    const digits = search.replace(/\D/g, "");
    if (digits.length >= 4) {
      clauses.push(
        "(o.order_number LIKE ? ESCAPE '\\\\' OR o.customer_name LIKE ? ESCAPE '\\\\' OR REPLACE(REPLACE(REPLACE(o.phone,' ',''),'-',''),'+','') LIKE ?)",
      );
      params.push(like, like, `%${digits}%`);
    } else {
      clauses.push("(o.order_number LIKE ? ESCAPE '\\\\' OR o.customer_name LIKE ? ESCAPE '\\\\')");
      params.push(like, like);
    }
  }

  return { where: clauses.join(" AND "), params };
}

export async function listAdminOrders(filters: AdminOrderFilters = {}): Promise<AdminOrderPage> {
  const page = Math.max(1, filters.page ?? 1);
  const orderBy = SORTS[filters.sort ?? "newest"] ?? SORTS.newest;
  const { where, params } = buildWhere(filters);

  // The tab counts ignore the status filter — a tab has to show its own count
  // even while another tab is selected — but honour every other filter.
  const { where: tabWhere, params: tabParams } = buildWhere({ ...filters, status: "all" });

  const [rows, [countRow], tabRows] = await Promise.all([
    query<OrderDbRow>(
      `SELECT o.id, o.order_number, o.created_at, o.customer_name, o.phone,
              o.total_amount, o.currency, o.status, o.payment_method, o.payment_status,
              s.label AS status_label, s.colour AS status_colour,
              (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
         FROM orders o
         LEFT JOIN order_statuses s ON s.\`key\` = o.status
        WHERE ${where}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?`,
      [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE],
    ),
    query<RowDataPacket & { n: number }>(`SELECT COUNT(*) AS n FROM orders o WHERE ${where}`, params),
    query<RowDataPacket & { status: string; n: number }>(
      `SELECT o.status, COUNT(*) AS n FROM orders o WHERE ${tabWhere} GROUP BY o.status`,
      tabParams,
    ),
  ]);

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

  const total = Number(countRow?.n ?? 0);
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
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    tabCounts,
  };
}

/**
 * Move one or more orders to a status, recording an activity row per order.
 *
 * Orders already on the target are skipped rather than logged — a bulk apply
 * over a mixed selection should not fill their feeds with "changed from Placed
 * to Placed".
 */
export async function setOrdersStatus(
  admin: AdminContext,
  orderIds: number[],
  statusKey: string,
): Promise<number> {
  const ids = orderIds.filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) return 0;

  return transaction(async (connection) => {
    const [[status]] = await connection.execute<(RowDataPacket & { key: string; label: string })[]>(
      "SELECT `key`, label FROM order_statuses WHERE `key` = ? LIMIT 1",
      [statusKey],
    );
    if (!status) throw new Error("That status no longer exists.");

    const placeholders = ids.map(() => "?").join(",");
    const [current] = await connection.execute<(RowDataPacket & { id: number; status: string })[]>(
      `SELECT id, status FROM orders WHERE id IN (${placeholders}) AND deleted_at IS NULL AND status <> ?`,
      [...ids, statusKey],
    );
    if (current.length === 0) return 0;

    const changing = current.map((r) => r.id);
    await connection.execute(
      `UPDATE orders SET status = ? WHERE id IN (${changing.map(() => "?").join(",")})`,
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

/** Soft delete. Orders are never removed — this only hides them from the list. */
export async function softDeleteOrders(admin: AdminContext, orderIds: number[]): Promise<number> {
  const ids = orderIds.filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) return 0;
  return transaction(async (connection) => {
    const placeholders = ids.map(() => "?").join(",");
    const [result] = await connection.execute<import("mysql2").ResultSetHeader>(
      `UPDATE orders SET deleted_at = NOW() WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
      ids,
    );
    await recordAdminAction(connection, admin, {
      action: "orders.delete",
      resourceType: "orders",
      resourceId: ids.length === 1 ? ids[0] : null,
      metadata: { count: result.affectedRows },
    });
    return result.affectedRows;
  });
}
