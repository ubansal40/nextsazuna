import "server-only";

import type { PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { NON_REDEMPTION_STATUSES, PAYMENT_WINDOW_MINUTES } from "../coupons";
import { query, queryOne, transaction } from "../db";
import { formatPrice } from "../format";
import { normalisePhone } from "../order-lookup";
import { recordAdminAction } from "./audit";
import { normaliseColour, type StatusColour } from "./order-status-colours";
import {
  toMinor,
  toDecimal,
  computeTotals,
  couponDiscountMinor,
  parseAdminMoney,
  clampDiscounts,
} from "./order-money";
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
 *
 * **One discount column, two sources.** `discount_amount` is the order's whole
 * discount, and `coupon_code` says where it came from: while a code is set the
 * discount IS that code's discount on the current subtotal, and is re-priced
 * whenever the lines change; with no code it is an amount an admin typed. A
 * manual discount therefore replaces a promo (and takes its code off), and
 * applying a promo replaces a manual discount — there is no column to hold both,
 * and a code shown beside a figure it did not produce is a label that lies.
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

/** Said by every edit that finds the order soft-deleted under it. */
export const DELETED_ORDER_MESSAGE = "This order has been deleted, so it can’t be edited.";

interface LockedOrderRow extends RowDataPacket {
  status: string;
  phone: string;
  coupon_code: string | null;
  discount_amount: string;
  loyalty_discount_npr: string;
  deleted_at: Date | null;
}

/**
 * Lock the order row for the rest of the transaction, refusing a deleted one.
 *
 * Every money edit reads the lines, recomputes and writes the totals. Without a
 * lock, two tabs saving at once each compute from their own snapshot and the
 * last to commit stores totals that disagree with the lines the other wrote.
 * `FOR UPDATE` makes the second wait, and because it is each transaction's
 * first read, the reads after it see what the first one committed.
 *
 * A soft-deleted order is refused rather than edited: it has left every list,
 * and an edit nobody can find again is worse than an error that says why.
 */
async function lockOrder(connection: PoolConnection, orderId: number): Promise<LockedOrderRow> {
  const [[row]] = await connection.execute<LockedOrderRow[]>(
    `SELECT status, phone, coupon_code, discount_amount, loyalty_discount_npr, deleted_at
       FROM orders WHERE id = ? LIMIT 1 FOR UPDATE`,
    [orderId],
  );
  if (!row) throw new Error("That order no longer exists.");
  if (row.deleted_at) throw new Error(DELETED_ORDER_MESSAGE);
  return row;
}

/** Paisa as the admin reads it, for the sentences an edit hands back. */
const money = (minor: number) => formatPrice(toDecimal(minor)) ?? toDecimal(minor);

interface CouponRow extends RowDataPacket {
  code: string;
  discount_type: "percent" | "fixed";
  discount_value: string;
  min_subtotal: string;
  max_discount: string | null;
  is_active: number;
  starts_at: Date | null;
  expires_at: Date | null;
  max_uses: number | null;
  used_count: number;
  per_customer_limit: number | null;
}

async function readCoupon(connection: PoolConnection, code: string): Promise<CouponRow | null> {
  const [[coupon]] = await connection.execute<CouponRow[]>(
    `SELECT code, discount_type, discount_value, min_subtotal, max_discount, is_active, starts_at, expires_at,
            max_uses, used_count, per_customer_limit
       FROM coupons WHERE code = ? LIMIT 1`,
    [code],
  );
  return coupon ?? null;
}

/** Read the money columns an order needs for a recompute. */
async function loadTotals(connection: PoolConnection, orderId: number) {
  const [[row]] = await connection.execute<
    (RowDataPacket & {
      discount_amount: string;
      loyalty_discount_npr: string;
      tax_amount: string;
      shipping_amount: string;
      total_amount: string;
    })[]
  >(
    "SELECT discount_amount, loyalty_discount_npr, tax_amount, shipping_amount, total_amount FROM orders WHERE id = ? LIMIT 1",
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
 *
 * The discounts are held inside the subtotal first (`clampDiscounts`), so a
 * discount left larger than the goods by an item edit cannot go on to eat the
 * delivery charge.
 */
async function rewriteTotals(
  connection: PoolConnection,
  orderId: number,
  overrides: Partial<{ discountMinor: number; loyaltyMinor: number; taxMinor: number; shippingMinor: number }> = {},
): Promise<import("./order-money").OrderTotals> {
  const current = await loadTotals(connection, orderId);
  const subtotal = await subtotalMinor(connection, orderId);
  const totals = computeTotals({
    subtotalMinor: subtotal,
    ...clampDiscounts(
      subtotal,
      overrides.discountMinor ?? toMinor(current.discount_amount),
      overrides.loyaltyMinor ?? toMinor(current.loyalty_discount_npr),
    ),
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
 * catalogue. It is still read strictly (`parseAdminMoney`): "1,500" is रु 1,500,
 * and "1,5o0" is refused rather than stored as nothing. Quantity is clamped at
 * 1: a zero-quantity line is a removal, and the UI removes it rather than
 * storing it.
 *
 * Returns a sentence when the edit moved a discount the admin did not touch —
 * a promo that no longer qualifies, a manual discount cut to the new subtotal —
 * so the screen can say so rather than let the total change without comment.
 */
export async function updateOrderItems(
  admin: AdminContext,
  orderId: number,
  lines: OrderLineInput[],
): Promise<string | null> {
  const clean = lines
    .map((line) => ({
      ...line,
      name: String(line.name ?? "").trim().slice(0, 180),
      sku: String(line.sku ?? "").trim().slice(0, 80),
    }))
    .filter((line) => line.name.length > 0)
    // Parsed after the filter, so a blank row nobody filled in cannot fail the
    // save over its empty price.
    .map((line) => ({
      ...line,
      quantity: Math.max(1, Math.floor(Number(line.quantity) || 1)),
      unitMinor: parseAdminMoney(line.unitPrice, `The price for “${line.name}”`),
    }));

  if (clean.length === 0) throw new Error("An order needs at least one item.");

  return transaction(async (connection) => {
    const order = await lockOrder(connection, orderId);
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

    /*
     * Re-price the promo against the goods as they now stand, using the coupon
     * as it is today. Only its arithmetic and its minimum are re-applied: whether
     * the code is active, in its window or under its usage limit was settled
     * when it went on, and an item edit a week later must not quietly take back
     * a promotion that was fairly given. Below the minimum the code comes off
     * entirely — the checkout would refuse it, and a code sitting on the order at
     * रु 0 reads as a promo that was applied. A code whose coupon has since been
     * deleted cannot be re-priced, so its stored discount stands.
     */
    const after = await subtotalMinor(connection, orderId);
    const coupon = order.coupon_code ? await readCoupon(connection, order.coupon_code) : null;
    let repriced: number | undefined;
    let notice: string | null = null;
    if (coupon && after < toMinor(coupon.min_subtotal)) {
      await connection.execute("UPDATE orders SET coupon_code = NULL WHERE id = ?", [orderId]);
      repriced = 0;
      notice = `Promo ${coupon.code} came off: it needs a subtotal of at least ${money(toMinor(coupon.min_subtotal))}.`;
    } else if (coupon) {
      repriced = couponDiscountMinor(after, {
        discountType: coupon.discount_type,
        discountValue: coupon.discount_value,
        maxDiscount: coupon.max_discount,
      });
    }

    const totals = await rewriteTotals(connection, orderId, repriced === undefined ? {} : { discountMinor: repriced });
    const discountBefore = toMinor(order.discount_amount);
    if (repriced === undefined && totals.discountMinor < discountBefore) {
      notice = `The discount was more than the items now come to, so it is now ${money(totals.discountMinor)}.`;
    }

    await logActivity(connection, admin, orderId, {
      kind: "edit",
      message: notice ? `Items edited. ${notice}` : "Items edited",
      diff: {
        subtotalBefore: toDecimal(before),
        subtotalAfter: toDecimal(totals.subtotalMinor),
        lines: clean.length,
        ...(totals.discountMinor !== discountBefore
          ? { discountBefore: toDecimal(discountBefore), discountAfter: toDecimal(totals.discountMinor) }
          : {}),
      },
    });
    await recordAdminAction(connection, admin, {
      action: "orders.items",
      resourceType: "orders",
      resourceId: orderId,
      metadata: { lines: clean.length, total: toDecimal(totals.totalMinor) },
    });
    return notice;
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
    await lockOrder(connection, orderId);
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

/**
 * Payment method / status, and the order's discount, which forces a recompute.
 *
 * The discount field is the order's WHOLE discount, not an extra on top of a
 * promo (see the note at the top of this file). A changed figure therefore
 * replaces the promo's and takes its code off. `discount: null` means the field
 * was not touched, and leaves the discount — and any promo — exactly as stored:
 * an editor opened before an item edit re-priced the promo still holds the old
 * figure, and sending that back must not read as a decision to replace it.
 *
 * A discount larger than the goods is refused rather than clamped: this is where
 * the figure was typed, so the admin should see the mistake, not a quietly
 * smaller number. Returns a sentence when the promo came off, or null.
 */
export async function updateOrderPayment(
  admin: AdminContext,
  orderId: number,
  input: { paymentMethod: string; paymentStatus: string; discount: string | null },
): Promise<string | null> {
  // Blank is "no discount" — the one amount it is natural to clear a field for.
  const typedMinor =
    input.discount === null
      ? null
      : String(input.discount).trim() === ""
        ? 0
        : parseAdminMoney(input.discount, "The discount");

  return transaction(async (connection) => {
    const order = await lockOrder(connection, orderId);
    const discountMinor = typedMinor ?? toMinor(order.discount_amount);
    const loyaltyMinor = toMinor(order.loyalty_discount_npr);
    const room = Math.max(0, (await subtotalMinor(connection, orderId)) - loyaltyMinor);
    if (typedMinor !== null && typedMinor > room) {
      throw new Error(
        `The discount can’t be more than ${money(room)} — what the items come to${loyaltyMinor > 0 ? " after loyalty" : ""}.`,
      );
    }

    const promo = order.coupon_code || null;
    const replacesPromo = promo !== null && typedMinor !== null && typedMinor !== toMinor(order.discount_amount);
    await connection.execute(
      `UPDATE orders SET payment_method = ?, payment_status = ?${replacesPromo ? ", coupon_code = NULL" : ""} WHERE id = ?`,
      [input.paymentMethod, input.paymentStatus, orderId],
    );
    const totals = await rewriteTotals(connection, orderId, { discountMinor });
    await logActivity(connection, admin, orderId, {
      kind: "edit",
      message: replacesPromo ? `Payment updated. A manual discount replaced promo ${promo}` : "Payment updated",
      diff: {
        discount: toDecimal(discountMinor),
        total: toDecimal(totals.totalMinor),
        ...(replacesPromo ? { promoRemoved: promo } : {}),
      },
    });
    await recordAdminAction(connection, admin, {
      action: "orders.payment",
      resourceType: "orders",
      resourceId: orderId,
      metadata: {
        paymentStatus: input.paymentStatus,
        total: toDecimal(totals.totalMinor),
        ...(replacesPromo ? { promoRemoved: promo } : {}),
      },
    });
    return replacesPromo ? `Promo ${promo} came off — the discount is now the amount you entered.` : null;
  });
}

/**
 * Apply a promo code to an existing order.
 *
 * The coupon's own rules are honoured — active, in window, within its usage
 * limit, min subtotal, and the percent cap — because an admin applying a code by
 * hand should not be able to grant more than the code itself allows.
 *
 * `used_count` is deliberately NOT incremented: this is an admin adjustment, not
 * a customer redemption, and inflating it would exhaust a limited-use code. It
 * is still *read*, so a code a customer could no longer use cannot be handed out
 * here either — that asymmetry was the gap, and it meant a sold-out promotion
 * stayed available to anyone who phoned the shop. The per-customer limit is
 * read for the same reason, counted exactly as the checkout counts it.
 *
 * The code's discount replaces the order's discount, including a manual one;
 * returns a sentence saying so when it did, or null.
 */
export async function applyOrderPromo(admin: AdminContext, orderId: number, code: string): Promise<string | null> {
  const wanted = code.trim().toUpperCase().slice(0, 50);
  if (!wanted) throw new Error("Enter a promo code.");

  return transaction(async (connection) => {
    const order = await lockOrder(connection, orderId);
    const coupon = await readCoupon(connection, wanted);
    if (!coupon) throw new Error("No such promo code.");
    if (coupon.is_active !== 1) throw new Error("That promo code is not active.");

    const now = Date.now();
    if (coupon.starts_at && new Date(coupon.starts_at).getTime() > now) throw new Error("That promo code isn't live yet.");
    if (coupon.expires_at && new Date(coupon.expires_at).getTime() < now) throw new Error("That promo code has expired.");
    if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
      throw new Error("That promo code has been fully redeemed.");
    }

    /*
     * The per-customer cap, counted the way `validateCoupon` counts it at
     * checkout: this customer's live orders carrying the code, less failed and
     * cancelled ones and gateway attempts abandoned past the payment window,
     * matched on the last ten digits of the phone so +977, a trunk 0 and spaces
     * all name the same person. This order is left out —
     * re-applying a code must not count against itself. A phone that does not
     * reduce to ten digits identifies nobody, so the cap cannot be checked, the
     * same as the checkout before it knows who is buying.
     */
    const phone = normalisePhone(order.phone);
    if (coupon.per_customer_limit !== null && coupon.per_customer_limit > 0 && phone.length === 10) {
      const [[prior]] = await connection.execute<(RowDataPacket & { used: number })[]>(
        `SELECT COUNT(*) AS used
           FROM orders
          WHERE coupon_code = ?
            AND id <> ?
            AND deleted_at IS NULL
            AND status NOT IN (${NON_REDEMPTION_STATUSES.map(() => "?").join(", ")})
            AND NOT (status = 'pending_payment'
                     AND created_at < NOW() - INTERVAL ${PAYMENT_WINDOW_MINUTES} MINUTE)
            AND RIGHT(REGEXP_REPLACE(phone, '[^0-9]', ''), 10) = ?`,
        [coupon.code, orderId, ...NON_REDEMPTION_STATUSES, phone],
      );
      const used = Number(prior?.used ?? 0);
      if (used >= coupon.per_customer_limit) {
        throw new Error(
          `This customer has already used ${coupon.code} ${used === 1 ? "once" : `${used} times`} — ` +
            `it allows ${coupon.per_customer_limit === 1 ? "one use" : `${coupon.per_customer_limit} uses`} per customer.`,
        );
      }
    }

    const subtotal = await subtotalMinor(connection, orderId);
    if (subtotal < toMinor(coupon.min_subtotal)) {
      throw new Error(`That code needs a subtotal of at least ${coupon.min_subtotal}.`);
    }

    const discountMinor = couponDiscountMinor(subtotal, {
      discountType: coupon.discount_type,
      discountValue: coupon.discount_value,
      maxDiscount: coupon.max_discount,
    });

    // A discount already on the order with no code behind it was typed by hand.
    const manualMinor = order.coupon_code ? 0 : toMinor(order.discount_amount);

    await connection.execute("UPDATE orders SET coupon_code = ? WHERE id = ?", [coupon.code, orderId]);
    const totals = await rewriteTotals(connection, orderId, { discountMinor });
    await logActivity(connection, admin, orderId, {
      kind: "edit",
      message: manualMinor > 0
        ? `Promo ${coupon.code} applied, replacing a manual discount of ${money(manualMinor)}`
        : `Promo ${coupon.code} applied`,
      diff: {
        discount: toDecimal(totals.discountMinor),
        total: toDecimal(totals.totalMinor),
        ...(manualMinor > 0 ? { replacedManualDiscount: toDecimal(manualMinor) } : {}),
      },
    });
    await recordAdminAction(connection, admin, {
      action: "orders.promo_apply",
      resourceType: "orders",
      resourceId: orderId,
      metadata: { code: coupon.code, discount: toDecimal(totals.discountMinor) },
    });
    return manualMinor > 0 ? `It replaces the manual discount of ${money(manualMinor)}.` : null;
  });
}

export async function removeOrderPromo(admin: AdminContext, orderId: number): Promise<void> {
  await transaction(async (connection) => {
    const order = await lockOrder(connection, orderId);
    await connection.execute("UPDATE orders SET coupon_code = NULL WHERE id = ?", [orderId]);
    const totals = await rewriteTotals(connection, orderId, { discountMinor: 0 });
    await logActivity(connection, admin, orderId, {
      kind: "edit",
      message: `Promo ${order.coupon_code ?? ""} removed`.trim(),
      diff: { total: toDecimal(totals.totalMinor) },
    });
    await recordAdminAction(connection, admin, {
      action: "orders.promo_remove",
      resourceType: "orders",
      resourceId: orderId,
      metadata: { code: order.coupon_code ?? null },
    });
  });
}

/**
 * An internal note. Deliberately allowed on a deleted order, unlike every edit
 * above: a note changes nothing about the order, and why it was deleted is
 * exactly the kind of thing someone will want to write down.
 */
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

// Cancelling lives with the other status moves, as `cancelOrders` in
// ./orders.ts, so the detail page, a list row and the bulk bar all take the
// same path — reason required, a `cancel` event in the feed.
