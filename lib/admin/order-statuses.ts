import "server-only";

import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { query, transaction } from "../db";
import { recordAdminAction } from "./audit";
import type { AdminContext } from "./rbac";

/**
 * The configurable order-status vocabulary (migration 0013).
 *
 * One row per status. `key` is what `orders.status` holds and what checkout and
 * the payment callbacks write, so it is immutable once created — the admin
 * renames `label`. System statuses carry side-effects elsewhere in the app and
 * cannot be deleted, though their label, colour, order and timeline visibility
 * are all theirs to change.
 *
 * `customerVisible` decides only whether a status draws as a step on the
 * customer's timeline. Whether a guest can find an order at all is a separate,
 * code-level enumeration boundary (`HIDDEN_ORDER_STATUSES` in
 * `lib/order-lookup.ts`) and is deliberately NOT admin-editable.
 */

// The colour vocabulary lives in a module without `server-only` so the drawer
// (a Client Component) can import the choices without dragging this file — and
// `next/headers`, via the audit log — into the browser bundle.
export { STATUS_COLOURS, normaliseColour, type StatusColour } from "./order-status-colours";
import { normaliseColour, type StatusColour } from "./order-status-colours";

export interface OrderStatusRow {
  id: number;
  key: string;
  label: string;
  colour: StatusColour;
  sortOrder: number;
  isSystem: boolean;
  isDefault: boolean;
  customerVisible: boolean;
  isTerminal: boolean;
  /** Live orders currently in this status — the drawer's "12 orders" note, and
   *  what makes a delete need a reassign target. */
  orderCount: number;
}

interface StatusDbRow extends RowDataPacket {
  id: number;
  key: string;
  label: string;
  colour: string;
  sort_order: number;
  is_system: number;
  is_default: number;
  customer_visible: number;
  is_terminal: number;
  order_count: number;
}

const SELECT_STATUSES = `
  SELECT s.id, s.\`key\`, s.label, s.colour, s.sort_order, s.is_system, s.is_default,
         s.customer_visible, s.is_terminal,
         (SELECT COUNT(*) FROM orders o WHERE o.status = s.\`key\` AND o.deleted_at IS NULL) AS order_count
    FROM order_statuses s
   ORDER BY s.sort_order, s.id`;

function toStatusRow(r: StatusDbRow): OrderStatusRow {
  return {
    id: r.id,
    key: r.key,
    label: r.label,
    colour: normaliseColour(r.colour),
    sortOrder: r.sort_order,
    isSystem: r.is_system === 1,
    isDefault: r.is_default === 1,
    customerVisible: r.customer_visible === 1,
    isTerminal: r.is_terminal === 1,
    orderCount: Number(r.order_count),
  };
}

export async function listOrderStatuses(): Promise<OrderStatusRow[]> {
  return (await query<StatusDbRow>(SELECT_STATUSES)).map(toStatusRow);
}

/** Re-read inside a transaction, so an action can return the fresh list without
 *  a second round trip after commit. */
async function listInTransaction(connection: import("mysql2/promise").PoolConnection): Promise<OrderStatusRow[]> {
  const [rows] = await connection.query<StatusDbRow[]>(SELECT_STATUSES);
  return rows.map(toStatusRow);
}

/**
 * Keys a status can never have, because the orders list already uses them.
 *
 * `all` is the list's "every status" tab and filter value: a status keyed `all`
 * could never be filtered to, and its orders would be counted into the All tab's
 * total. `constructor` because the tab counts are a plain object, where a status
 * with no orders would be read back as Object.prototype's function, not a number.
 */
const RESERVED_KEYS = new Set(["all", "constructor"]);

/** A system status key (migration 0013) — so it can be neither deleted nor re-keyed. */
const CANCELLED = "cancelled";

/** `Awaiting stone setting` -> `awaiting_stone_setting`. */
function keyFromLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60);
}

export async function createOrderStatus(
  admin: AdminContext,
  input: { label: string; colour: string },
): Promise<OrderStatusRow[]> {
  const label = input.label.trim().slice(0, 80);
  if (!label) throw new Error("A name is required.");
  const base = keyFromLabel(label);
  if (!base) throw new Error("That name has no letters or numbers in it.");
  if (RESERVED_KEYS.has(base)) {
    throw new Error(`“${label}” is a name the orders list already uses for itself — pick another.`);
  }

  return transaction(async (connection) => {
    // The key is derived once and must be unique; a clash means the admin is
    // adding a status that already exists under a different capitalisation.
    const [clash] = await connection.execute<(RowDataPacket & { id: number })[]>(
      "SELECT id FROM order_statuses WHERE `key` = ? LIMIT 1",
      [base],
    );
    if (clash.length > 0) throw new Error(`A status called “${label}” already exists.`);

    const [[next]] = await connection.execute<(RowDataPacket & { n: number })[]>(
      "SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM order_statuses",
    );
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO order_statuses (\`key\`, label, colour, sort_order, is_system, is_default, customer_visible, is_terminal)
       VALUES (?, ?, ?, ?, 0, 0, 1, 0)`,
      [base, label, normaliseColour(input.colour), next.n],
    );
    await recordAdminAction(connection, admin, {
      action: "order_statuses.create",
      resourceType: "order_statuses",
      resourceId: result.insertId,
      metadata: { key: base, label },
    });
    return listInTransaction(connection);
  });
}

/**
 * Label, colour and timeline visibility — the three things a system status also
 * allows. The key is never touched.
 */
export async function updateOrderStatus(
  admin: AdminContext,
  id: number,
  patch: { label?: string; colour?: string; customerVisible?: boolean },
): Promise<OrderStatusRow[]> {
  return transaction(async (connection) => {
    const [[current]] = await connection.execute<(RowDataPacket & { key: string; label: string })[]>(
      "SELECT `key`, label FROM order_statuses WHERE id = ? LIMIT 1",
      [id],
    );
    if (!current) throw new Error("That status no longer exists.");

    const sets: string[] = [];
    const params: (string | number)[] = [];
    if (patch.label !== undefined) {
      const label = patch.label.trim().slice(0, 80);
      if (!label) throw new Error("A name is required.");
      sets.push("label = ?");
      params.push(label);
    }
    if (patch.colour !== undefined) {
      sets.push("colour = ?");
      params.push(normaliseColour(patch.colour));
    }
    if (patch.customerVisible !== undefined) {
      sets.push("customer_visible = ?");
      params.push(patch.customerVisible ? 1 : 0);
    }
    if (sets.length === 0) return listInTransaction(connection);

    params.push(id);
    await connection.execute(`UPDATE order_statuses SET ${sets.join(", ")} WHERE id = ?`, params);
    await recordAdminAction(connection, admin, {
      action: "order_statuses.update",
      resourceType: "order_statuses",
      resourceId: id,
      metadata: { key: current.key, ...patch },
    });
    return listInTransaction(connection);
  });
}

/**
 * Exactly one default. Cleared everywhere, then set, in one transaction — so no
 * window exists where two rows claim it or none does.
 *
 * This flag is the app's default, NOT the `orders.status` column default. The
 * column default is deliberately left alone: checkout always writes `status`
 * explicitly (`pending_payment` or `placed`), so it is never consulted, and
 * changing it would mean issuing `ALTER TABLE` from a Server Action — runtime
 * DDL, which forces an implicit commit in MySQL and would silently break this
 * transaction, quite apart from CLAUDE.md's "schema changes are migrations
 * only". Anything creating an order without an explicit status reads this flag.
 */
export async function setDefaultOrderStatus(admin: AdminContext, id: number): Promise<OrderStatusRow[]> {
  return transaction(async (connection) => {
    const [[target]] = await connection.execute<(RowDataPacket & { key: string })[]>(
      "SELECT `key` FROM order_statuses WHERE id = ? LIMIT 1",
      [id],
    );
    if (!target) throw new Error("That status no longer exists.");

    await connection.execute("UPDATE order_statuses SET is_default = 0 WHERE is_default = 1");
    await connection.execute("UPDATE order_statuses SET is_default = 1 WHERE id = ?", [id]);
    await recordAdminAction(connection, admin, {
      action: "order_statuses.default",
      resourceType: "order_statuses",
      resourceId: id,
      metadata: { key: target.key },
    });
    return listInTransaction(connection);
  });
}

export async function reorderOrderStatuses(admin: AdminContext, orderedIds: number[]): Promise<OrderStatusRow[]> {
  const ids = orderedIds.filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) return listOrderStatuses();
  return transaction(async (connection) => {
    for (let i = 0; i < ids.length; i += 1) {
      await connection.execute("UPDATE order_statuses SET sort_order = ? WHERE id = ?", [i + 1, ids[i]]);
    }
    await recordAdminAction(connection, admin, {
      action: "order_statuses.reorder",
      resourceType: "order_statuses",
      metadata: { count: ids.length },
    });
    return listInTransaction(connection);
  });
}

/**
 * Delete a custom status, moving any orders on it to `reassignToKey`.
 *
 * System statuses and the default are refused outright. The reassign is not
 * optional when orders are on the status: leaving them pointing at a key with
 * no row would make them unreadable everywhere the label is joined.
 *
 * `cancelled` is refused as a destination: cancelling needs a reason and a
 * `cancel` event (`cancelOrders`), and a status deletion can supply neither.
 */
export async function deleteOrderStatus(
  admin: AdminContext,
  id: number,
  reassignToKey: string,
): Promise<OrderStatusRow[]> {
  return transaction(async (connection) => {
    const [[target]] = await connection.execute<
      (RowDataPacket & { key: string; label: string; is_system: number; is_default: number })[]
    >("SELECT `key`, label, is_system, is_default FROM order_statuses WHERE id = ? LIMIT 1", [id]);
    if (!target) throw new Error("That status no longer exists.");
    if (target.is_system === 1) throw new Error("System statuses keep the platform working and can't be deleted.");
    if (target.is_default === 1) throw new Error("Make another status the default before deleting this one.");

    // Counted exactly as the drawer counts `orderCount` — live orders only — so
    // the dialog that did or did not ask where they should go, and this guard,
    // agree on whether anything needs to. They used to count differently: a
    // status holding only deleted orders said "nothing moves" on screen, and
    // this then moved them to whatever the hidden select had defaulted to.
    const [[inUse]] = await connection.execute<(RowDataPacket & { n: number })[]>(
      "SELECT COUNT(*) AS n FROM orders WHERE status = ? AND deleted_at IS NULL",
      [target.key],
    );
    const chosen = reassignToKey && reassignToKey !== target.key ? reassignToKey : null;
    if (Number(inUse.n) > 0 && !chosen) {
      throw new Error("Choose a status to move those orders to first.");
    }

    // The ids are captured BEFORE the move. Selecting them afterwards by the
    // destination key would sweep in every order that was already on that
    // status and write this history onto orders nobody touched. Deleted orders
    // are included, or they would be left on a key with no row; with no live
    // order to choose a destination for, they go to the default status.
    const [moved] = await connection.execute<(RowDataPacket & { id: number })[]>(
      "SELECT id FROM orders WHERE status = ?",
      [target.key],
    );
    let movedTo: string | null = null;
    if (moved.length > 0) {
      const [[destination]] = await connection.execute<(RowDataPacket & { key: string })[]>(
        chosen
          ? "SELECT `key` FROM order_statuses WHERE `key` = ? LIMIT 1"
          : "SELECT `key` FROM order_statuses WHERE is_default = 1 LIMIT 1",
        chosen ? [chosen] : [],
      );
      if (!destination) throw new Error("That destination status no longer exists.");
      if (destination.key === CANCELLED) {
        throw new Error("Cancelling needs a reason, so orders can’t be moved to Cancelled from here.");
      }
      movedTo = destination.key;

      await connection.execute("UPDATE orders SET status = ? WHERE status = ?", [movedTo, target.key]);

      // Every moved order gets a feed entry: its status changed without anyone
      // opening it, and the detail must be able to say why.
      for (const row of moved) {
        await connection.execute(
          `INSERT INTO order_activity (order_id, admin_id, admin_email, event_type, from_status, to_status, message)
           VALUES (?, ?, ?, 'status', ?, ?, ?)`,
          [row.id, admin.id, admin.email, target.key, movedTo, `Status “${target.label}” was deleted`],
        );
      }
    }

    await connection.execute("DELETE FROM order_statuses WHERE id = ?", [id]);
    await recordAdminAction(connection, admin, {
      action: "order_statuses.delete",
      resourceType: "order_statuses",
      resourceId: id,
      metadata: { key: target.key, movedOrders: moved.length, movedTo },
    });
    return listInTransaction(connection);
  });
}
