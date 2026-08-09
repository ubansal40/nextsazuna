import "server-only";

import type { PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { query, queryOne, transaction } from "../db";
import { recordAdminAction } from "./audit";
import { normaliseColour, type StatusColour } from "./order-status-colours";
import { toMinor, toDecimal, computeTotals, couponDiscountMinor } from "./order-money";
import type { AdminContext } from "./rbac";

// Re-exported so callers have one import for an order's money helpers.
export { toMinor, toDecimal, computeTotals, type OrderTotals } from "./order-money";

/**
 * One order, and every edit the admin can make to it.
 *
 * **Money never touches a float.** Values arrive from MySQL as DECIMAL strings
 * (ADR 0003); everything here converts to integer paisa, does the arithmetic,
 * and converts back at the write. `0.1 + 0.2` on an invoice is not a rounding
 * curiosity, it is a wrong bill.
 *
 * Every mutation recomputes the totals from the lines rather than trusting the
 * stored `total_amount`, so an order cannot drift into a state where its parts
 * do not add up to its total.
 */

/* --- reads ----------------------------------------------------------------- */

export interface OrderItemRow {
  id: number;
  productId: number | null;
  name: string;
  sku: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
  imageUrl: string | null;
}

export interface OrderFeedEntry {
  id: string;
  kind: "note" | "status" | "edit" | "notify" | "cancel";
  actor: string | null;
  message: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  at: string;
}

export interface OrderDetail {
  id: number;
  orderNumber: string;
  createdAt: string;
  status: string;
  statusLabel: string;
  statusColour: StatusColour;
  customerName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  note: string | null;
  paymentMethod: string;
  paymentStatus: string;
  couponCode: string | null;
  cancelReason: string | null;
  deletedAt: string | null;
  subtotal: string;
  discountAmount: string;
  loyaltyDiscount: string;
  taxAmount: string;
  shippingAmount: string;
  totalAmount: string;
  currency: string;
  items: OrderItemRow[];
  feed: OrderFeedEntry[];
}

interface OrderDbRow extends RowDataPacket {
  id: number;
  order_number: string;
  created_at: Date;
  status: string;
  status_label: string | null;
  status_colour: string | null;
  customer_name: string;
  email: string;
  phone: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  note: string | null;
  payment_method: string;
  payment_status: string;
  coupon_code: string | null;
  cancel_reason: string | null;
  deleted_at: Date | null;
  subtotal: string;
  discount_amount: string;
  loyalty_discount_npr: string;
  tax_amount: string;
  shipping_amount: string;
  total_amount: string;
  currency: string;
}

const iso = (value: Date | string | null) =>
  value ? (value instanceof Date ? value : new Date(value)).toISOString() : null;

/**
 * One order with its lines and its feed.
 *
 * The feed merges `order_activity` (system events) with `order_notes` (the
 * existing internal-notes table, which predates this screen and holds live
 * rows) and sorts by time — two sources, one story.
 */
export async function getOrderDetail(id: number): Promise<OrderDetail | null> {
  const order = await queryOne<OrderDbRow>(
    `SELECT o.*, s.label AS status_label, s.colour AS status_colour
       FROM orders o LEFT JOIN order_statuses s ON s.\`key\` = o.status
      WHERE o.id = ? LIMIT 1`,
    [id],
  );
  if (!order) return null;

  const [items, activity, notes] = await Promise.all([
    query<RowDataPacket & { id: number; product_id: number | null; product_name: string; product_sku: string; unit_price: string; quantity: number; line_total: string; image_url: string | null }>(
      `SELECT oi.id, oi.product_id, oi.product_name, oi.product_sku, oi.unit_price, oi.quantity, oi.line_total,
              p.image_url
         FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = ? ORDER BY oi.id`,
      [id],
    ),
    query<RowDataPacket & { id: number; admin_email: string | null; event_type: string; from_status: string | null; to_status: string | null; message: string | null; created_at: Date }>(
      `SELECT id, admin_email, event_type, from_status, to_status, message, created_at
         FROM order_activity WHERE order_id = ? ORDER BY created_at DESC, id DESC LIMIT 200`,
      [id],
    ),
    query<RowDataPacket & { id: number; admin_email: string | null; message: string; created_at: Date }>(
      `SELECT id, admin_email, message, created_at
         FROM order_notes WHERE order_id = ? ORDER BY created_at DESC, id DESC LIMIT 200`,
      [id],
    ),
  ]);

  const feed: OrderFeedEntry[] = [
    ...activity.map((a) => ({
      id: `a${a.id}`,
      kind: (["note", "status", "edit", "notify", "cancel"].includes(a.event_type)
        ? a.event_type
        : "edit") as OrderFeedEntry["kind"],
      actor: a.admin_email,
      message: a.message,
      fromStatus: a.from_status,
      toStatus: a.to_status,
      at: iso(a.created_at)!,
    })),
    ...notes.map((n) => ({
      id: `n${n.id}`,
      kind: "note" as const,
      actor: n.admin_email,
      message: n.message,
      fromStatus: null,
      toStatus: null,
      at: iso(n.created_at)!,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return {
    id: order.id,
    orderNumber: order.order_number,
    createdAt: iso(order.created_at)!,
    status: order.status,
    statusLabel: order.status_label ?? order.status,
    statusColour: normaliseColour(order.status_colour),
    customerName: order.customer_name,
    email: order.email,
    phone: order.phone,
    addressLine1: order.address_line1,
    addressLine2: order.address_line2,
    city: order.city,
    state: order.state,
    postalCode: order.postal_code,
    country: order.country,
    note: order.note,
    paymentMethod: order.payment_method,
    paymentStatus: order.payment_status,
    couponCode: order.coupon_code,
    cancelReason: order.cancel_reason,
    deletedAt: iso(order.deleted_at),
    subtotal: order.subtotal,
    discountAmount: order.discount_amount,
    loyaltyDiscount: order.loyalty_discount_npr,
    taxAmount: order.tax_amount,
    shippingAmount: order.shipping_amount,
    totalAmount: order.total_amount,
    currency: order.currency,
    items: items.map((i) => ({
      id: i.id,
      productId: i.product_id,
      name: i.product_name,
      sku: i.product_sku,
      unitPrice: i.unit_price,
      quantity: i.quantity,
      lineTotal: i.line_total,
      imageUrl: i.image_url,
    })),
    feed,
  };
}

/* --- writes ---------------------------------------------------------------- */

/** Read the money columns an order needs for a recompute. */
async function loadTotals(connection: PoolConnection, orderId: number) {
  const [[row]] = await connection.execute<
    (RowDataPacket & {
      discount_amount: string;
      loyalty_discount_npr: string;
      tax_amount: string;
      shipping_amount: string;
      total_amount: string;
      status: string;
    })[]
  >(
    "SELECT discount_amount, loyalty_discount_npr, tax_amount, shipping_amount, total_amount, status FROM orders WHERE id = ? LIMIT 1",
    [orderId],
  );
  if (!row) throw new Error("That order no longer exists.");
  return row;
}

/** Sum the lines. The subtotal is always derived, never taken on trust. */
async function subtotalMinor(connection: PoolConnection, orderId: number): Promise<number> {
  const [[row]] = await connection.execute<(RowDataPacket & { s: string | null })[]>(
    "SELECT SUM(line_total) AS s FROM order_items WHERE order_id = ?",
    [orderId],
  );
  return toMinor(row?.s ?? 0);
}

/**
 * Recompute and persist subtotal + total from the current lines and discounts,
 * returning the new totals so the caller can log what changed.
 */
async function rewriteTotals(
  connection: PoolConnection,
  orderId: number,
  overrides: Partial<{ discountMinor: number; loyaltyMinor: number; taxMinor: number; shippingMinor: number }> = {},
): Promise<import("./order-money").OrderTotals> {
  const current = await loadTotals(connection, orderId);
  const totals = computeTotals({
    subtotalMinor: await subtotalMinor(connection, orderId),
    discountMinor: overrides.discountMinor ?? toMinor(current.discount_amount),
    loyaltyMinor: overrides.loyaltyMinor ?? toMinor(current.loyalty_discount_npr),
    taxMinor: overrides.taxMinor ?? toMinor(current.tax_amount),
    shippingMinor: overrides.shippingMinor ?? toMinor(current.shipping_amount),
  });
  await connection.execute(
    `UPDATE orders SET subtotal = ?, discount_amount = ?, loyalty_discount_npr = ?,
            tax_amount = ?, shipping_amount = ?, total_amount = ? WHERE id = ?`,
    [
      toDecimal(totals.subtotalMinor),
      toDecimal(totals.discountMinor),
      toDecimal(totals.loyaltyMinor),
      toDecimal(totals.taxMinor),
      toDecimal(totals.shippingMinor),
      toDecimal(totals.totalMinor),
      orderId,
    ],
  );
  return totals;
}

async function logActivity(
  connection: PoolConnection,
  admin: AdminContext,
  orderId: number,
  entry: { kind: string; message?: string | null; from?: string | null; to?: string | null; diff?: unknown },
) {
  await connection.execute(
    `INSERT INTO order_activity (order_id, admin_id, admin_email, event_type, from_status, to_status, message, diff_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      orderId,
      admin.id,
      admin.email,
      entry.kind,
      entry.from ?? null,
      entry.to ?? null,
      entry.message ?? null,
      entry.diff === undefined ? null : JSON.stringify(entry.diff),
    ],
  );
}

export interface OrderLineInput {
  /** Existing line id, or null for a line being added. */
  id: number | null;
  productId: number | null;
  name: string;
  sku: string;
  unitPrice: string;
  quantity: number;
}

/**
 * Replace an order's lines, then recompute.
 *
 * A per-order price is legitimate — a discount agreed at the counter, a
 * remade piece — so the line price is free text rather than pinned to the
 * catalogue. Quantity is clamped at 1: a zero-quantity line is a removal, and
 * the UI removes it rather than storing it.
 */
export async function updateOrderItems(
  admin: AdminContext,
  orderId: number,
  lines: OrderLineInput[],
): Promise<void> {
  const clean = lines
    .map((line) => ({
      ...line,
      name: line.name.trim().slice(0, 180),
      sku: line.sku.trim().slice(0, 80),
      quantity: Math.max(1, Math.floor(Number(line.quantity) || 1)),
      unitMinor: toMinor(line.unitPrice),
    }))
    .filter((line) => line.name.length > 0);

  if (clean.length === 0) throw new Error("An order needs at least one item.");
  if (clean.some((line) => line.unitMinor < 0)) throw new Error("A line price cannot be negative.");

  await transaction(async (connection) => {
    const before = await subtotalMinor(connection, orderId);

    const keep = clean.filter((l) => l.id != null).map((l) => l.id as number);
    if (keep.length > 0) {
      await connection.execute(
        `DELETE FROM order_items WHERE order_id = ? AND id NOT IN (${keep.map(() => "?").join(",")})`,
        [orderId, ...keep],
      );
    } else {
      await connection.execute("DELETE FROM order_items WHERE order_id = ?", [orderId]);
    }

    for (const line of clean) {
      const lineTotal = toDecimal(line.unitMinor * line.quantity);
      if (line.id == null) {
        await connection.execute<ResultSetHeader>(
          `INSERT INTO order_items (order_id, product_id, product_name, product_sku, unit_price, quantity, line_total)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [orderId, line.productId, line.name, line.sku, toDecimal(line.unitMinor), line.quantity, lineTotal],
        );
      } else {
        await connection.execute(
          `UPDATE order_items SET product_name = ?, product_sku = ?, unit_price = ?, quantity = ?, line_total = ?
            WHERE id = ? AND order_id = ?`,
          [line.name, line.sku, toDecimal(line.unitMinor), line.quantity, lineTotal, line.id, orderId],
        );
      }
    }

    const totals = await rewriteTotals(connection, orderId);
    await logActivity(connection, admin, orderId, {
      kind: "edit",
      message: "Items edited",
      diff: { subtotalBefore: toDecimal(before), subtotalAfter: toDecimal(totals.subtotalMinor), lines: clean.length },
    });
    await recordAdminAction(connection, admin, {
      action: "orders.items",
      resourceType: "orders",
      resourceId: orderId,
      metadata: { lines: clean.length, total: toDecimal(totals.totalMinor) },
    });
  });
}

export interface OrderCustomerInput {
  customerName: string;
  phone: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
}

export async function updateOrderCustomer(
  admin: AdminContext,
  orderId: number,
  input: OrderCustomerInput,
): Promise<void> {
  const name = input.customerName.trim().slice(0, 120);
  const phone = input.phone.trim().slice(0, 30);
  if (!name) throw new Error("A customer name is required.");
  if (!phone) throw new Error("A phone number is required.");

  await transaction(async (connection) => {
    await connection.execute(
      `UPDATE orders SET customer_name = ?, phone = ?, email = ?, address_line1 = ?, address_line2 = ?,
              city = ?, state = ?, postal_code = ? WHERE id = ?`,
      [
        name,
        phone,
        input.email.trim().slice(0, 190),
        input.addressLine1.trim().slice(0, 255),
        input.addressLine2.trim().slice(0, 255) || null,
        input.city.trim().slice(0, 120),
        input.state.trim().slice(0, 120),
        input.postalCode.trim().slice(0, 30),
        orderId,
      ],
    );
    await logActivity(connection, admin, orderId, { kind: "edit", message: "Customer & delivery updated" });
    await recordAdminAction(connection, admin, {
      action: "orders.customer",
      resourceType: "orders",
      resourceId: orderId,
    });
  });
}

/** Payment method / status, and the manual discount, which forces a recompute. */
export async function updateOrderPayment(
  admin: AdminContext,
  orderId: number,
  input: { paymentMethod: string; paymentStatus: string; discount: string },
): Promise<void> {
  const discountMinor = toMinor(input.discount);
  if (discountMinor < 0) throw new Error("A discount cannot be negative.");

  await transaction(async (connection) => {
    await connection.execute("UPDATE orders SET payment_method = ?, payment_status = ? WHERE id = ?", [
      input.paymentMethod,
      input.paymentStatus,
      orderId,
    ]);
    const totals = await rewriteTotals(connection, orderId, { discountMinor });
    await logActivity(connection, admin, orderId, {
      kind: "edit",
      message: "Payment updated",
      diff: { discount: toDecimal(discountMinor), total: toDecimal(totals.totalMinor) },
    });
    await recordAdminAction(connection, admin, {
      action: "orders.payment",
      resourceType: "orders",
      resourceId: orderId,
      metadata: { paymentStatus: input.paymentStatus, total: toDecimal(totals.totalMinor) },
    });
  });
}

/**
 * Apply a promo code to an existing order.
 *
 * The coupon's own rules are honoured — active, in window, min subtotal, and
 * the percent cap — because an admin applying a code by hand should not be able
 * to grant more than the code itself allows. `used_count` is deliberately NOT
 * incremented: this is an admin adjustment, not a customer redemption, and
 * inflating it would exhaust a limited-use code.
 */
export async function applyOrderPromo(admin: AdminContext, orderId: number, code: string): Promise<void> {
  const wanted = code.trim().toUpperCase().slice(0, 50);
  if (!wanted) throw new Error("Enter a promo code.");

  await transaction(async (connection) => {
    const [[coupon]] = await connection.execute<
      (RowDataPacket & {
        code: string;
        discount_type: "percent" | "fixed";
        discount_value: string;
        min_subtotal: string;
        max_discount: string | null;
        is_active: number;
        starts_at: Date | null;
        expires_at: Date | null;
      })[]
    >(
      `SELECT code, discount_type, discount_value, min_subtotal, max_discount, is_active, starts_at, expires_at
         FROM coupons WHERE code = ? LIMIT 1`,
      [wanted],
    );
    if (!coupon) throw new Error("No such promo code.");
    if (coupon.is_active !== 1) throw new Error("That promo code is not active.");

    const now = Date.now();
    if (coupon.starts_at && new Date(coupon.starts_at).getTime() > now) throw new Error("That promo code isn't live yet.");
    if (coupon.expires_at && new Date(coupon.expires_at).getTime() < now) throw new Error("That promo code has expired.");

    const subtotal = await subtotalMinor(connection, orderId);
    if (subtotal < toMinor(coupon.min_subtotal)) {
      throw new Error(`That code needs a subtotal of at least ${coupon.min_subtotal}.`);
    }

    const discountMinor = couponDiscountMinor(subtotal, {
      discountType: coupon.discount_type,
      discountValue: coupon.discount_value,
      maxDiscount: coupon.max_discount,
    });

    await connection.execute("UPDATE orders SET coupon_code = ? WHERE id = ?", [coupon.code, orderId]);
    const totals = await rewriteTotals(connection, orderId, { discountMinor });
    await logActivity(connection, admin, orderId, {
      kind: "edit",
      message: `Promo ${coupon.code} applied`,
      diff: { discount: toDecimal(discountMinor), total: toDecimal(totals.totalMinor) },
    });
    await recordAdminAction(connection, admin, {
      action: "orders.promo_apply",
      resourceType: "orders",
      resourceId: orderId,
      metadata: { code: coupon.code, discount: toDecimal(discountMinor) },
    });
  });
}

export async function removeOrderPromo(admin: AdminContext, orderId: number): Promise<void> {
  await transaction(async (connection) => {
    const [[row]] = await connection.execute<(RowDataPacket & { coupon_code: string | null })[]>(
      "SELECT coupon_code FROM orders WHERE id = ? LIMIT 1",
      [orderId],
    );
    await connection.execute("UPDATE orders SET coupon_code = NULL WHERE id = ?", [orderId]);
    const totals = await rewriteTotals(connection, orderId, { discountMinor: 0 });
    await logActivity(connection, admin, orderId, {
      kind: "edit",
      message: `Promo ${row?.coupon_code ?? ""} removed`.trim(),
      diff: { total: toDecimal(totals.totalMinor) },
    });
    await recordAdminAction(connection, admin, {
      action: "orders.promo_remove",
      resourceType: "orders",
      resourceId: orderId,
      metadata: { code: row?.coupon_code ?? null },
    });
  });
}

export async function addOrderNote(admin: AdminContext, orderId: number, message: string): Promise<void> {
  const text = message.trim().slice(0, 500);
  if (!text) throw new Error("Write something first.");
  await transaction(async (connection) => {
    await connection.execute(
      "INSERT INTO order_notes (order_id, admin_id, admin_email, message) VALUES (?, ?, ?, ?)",
      [orderId, admin.id, admin.email, text],
    );
    await recordAdminAction(connection, admin, {
      action: "orders.note",
      resourceType: "orders",
      resourceId: orderId,
    });
  });
}

/** Cancel with a reason. The reason is stored on the order, not just narrated
 *  in the feed, so a report can group by it later. */
export async function cancelOrder(
  admin: AdminContext,
  orderId: number,
  reason: string,
  note: string,
): Promise<void> {
  const why = reason.trim().slice(0, 120);
  if (!why) throw new Error("Pick a reason before cancelling.");

  await transaction(async (connection) => {
    const current = await loadTotals(connection, orderId);
    await connection.execute("UPDATE orders SET status = 'cancelled', cancel_reason = ? WHERE id = ?", [why, orderId]);
    await logActivity(connection, admin, orderId, {
      kind: "cancel",
      from: current.status,
      to: "cancelled",
      message: note.trim() ? `${why} — ${note.trim().slice(0, 400)}` : why,
    });
    await recordAdminAction(connection, admin, {
      action: "orders.cancel",
      resourceType: "orders",
      resourceId: orderId,
      metadata: { reason: why, from: current.status },
    });
  });
}
