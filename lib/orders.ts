import "server-only";

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { NON_REDEMPTION_STATUSES, releaseCouponUse, reserveCouponUse } from "./coupons";
import { linkCustomerToOrder } from "./customers";
import { query, queryOne, transaction } from "./db";
import { formatPrice } from "./format";
import {
  contactMatches,
  isVisibleStatus,
  toBuyerSafeView,
  toReceiptView,
  type TimelineStatus,
  type OrderItemRowLike,
  type OrderRowLike,
  type OrderView,
} from "./order-lookup";
import { verifyOrderLookupToken } from "./order-tokens";
import type { CartLine } from "./cart";

interface OrderRow extends RowDataPacket {
  order_number: string;
  customer_name: string;
  total_amount: string;
  payment_status: string;
  status: string;
}

/** The full row both order views project from. */
type FullOrderRow = RowDataPacket & OrderRowLike;
type OrderItemRow = RowDataPacket & OrderItemRowLike;

/**
 * Every column the two projections read. Written once so the token path and the
 * guest path cannot drift into selecting different things — the allowlist that
 * keeps email out of a guest response lives in the projection, not here.
 */
const ORDER_COLUMNS = `order_number, status, payment_method, payment_status,
        created_at, updated_at, customer_name, email, phone,
        address_line1, city, postal_code, country,
        subtotal, discount_amount, shipping_amount, total_amount`;

async function loadItems(orderNumber: string): Promise<OrderItemRow[]> {
  return query<OrderItemRow>(
    `SELECT i.product_name, i.product_sku, i.quantity, i.line_total
       FROM order_items i
       JOIN orders o ON o.id = i.order_id
      WHERE o.order_number = ?
      ORDER BY i.id ASC`,
    [orderNumber],
  );
}

/**
 * Order creation.
 *
 * Writes `orders` and its `order_items` in one transaction: an order row with
 * no lines is worse than no order at all, because it looks fulfillable.
 *
 * Every amount passed in has already been computed on the server from the
 * catalog and the coupons table — see `app/checkout/_actions.ts`. Nothing here
 * accepts a figure that came from a browser.
 */

export interface OrderCustomer {
  name: string;
  phone: string;
  email: string;
  address: string;
  city?: string;
  note?: string;
}

export interface OrderTotals {
  subtotalMinor: number;
  discountMinor: number;
  /** Gift wrap and any payment surcharge, both charged as shipping-side extras. */
  extrasMinor: number;
  totalMinor: number;
  couponCode: string | null;
}

export interface CreatedOrder {
  id: number;
  orderNumber: string;
}

/** The line `createOrder` writes into the order's note when gift wrap was paid for. */
export const GIFT_WRAP_NOTE = "[gift wrap] Signature box, ribbon & handwritten note — paid at checkout";

/** Paisa to the DECIMAL string the money columns expect. */
function decimal(minor: number): string {
  return (minor / 100).toFixed(2);
}

/** Nepal is UTC+05:45 all year — it keeps no daylight saving. */
const NEPAL_OFFSET_MS = (5 * 60 + 45) * 60_000;

/**
 * Human-facing order number.
 *
 * Date-prefixed and random rather than sequential: a guessable order number
 * plus an order-status page is an enumeration hole, and this one is printed on
 * invoices where the sequence would leak volume.
 *
 * The date is the shop's, not UTC's: an order placed at 01:00 in Kathmandu
 * used to be stamped with the previous day.
 *
 * Three base-36 characters are 46,656 numbers a day, so two orders will
 * eventually draw the same one. `createOrder` is always called through
 * `isDuplicateOrderNumber` retries (see `placeOrder`) for that reason.
 */
export function generateOrderNumber(now: Date = new Date()): string {
  const stamp = new Date(now.getTime() + NEPAL_OFFSET_MS).toISOString().slice(2, 10).replace(/-/g, "");
  const random = Math.floor(Math.random() * 46656)
    .toString(36)
    .toUpperCase()
    .padStart(3, "0");
  return `SZ-${stamp}-${random}`;
}

/** The order number was already taken — draw another and try again. */
export function isDuplicateOrderNumber(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return e?.code === "ER_DUP_ENTRY" && /order_number/.test(e.message ?? "");
}

export async function createOrder(input: {
  orderNumber: string;
  customer: OrderCustomer;
  lines: CartLine[];
  totals: OrderTotals;
  /** Must be a value the `orders.payment_method` enum accepts. */
  paymentMethod: "cod" | "esewa" | "khalti" | "cybersource";
  /** The customer paid for gift wrap; somebody has to wrap it. */
  giftWrap?: boolean;
}): Promise<CreatedOrder> {
  if (!input.lines.length) throw new Error("Cannot create an order with no lines");

  // Card and wallet orders are not placed until the gateway says so; cash is.
  const pending = input.paymentMethod !== "cod";

  /*
   * Gift wrap is charged inside `shipping_amount` alongside any card surcharge,
   * and nothing else on the order said it had been asked for — the admin saw
   * "Delivery & surcharge रु 500" and fulfilment had no way to know a box,
   * ribbon and handwritten note were owed. The note is what the order screen
   * and the alert email already show.
   */
  const note = [input.customer.note?.trim(), input.giftWrap ? GIFT_WRAP_NOTE : null]
    .filter(Boolean)
    .join("\n");

  return transaction(async (connection) => {
    // First, before anything is written: if the code's last use (or this
    // phone's allowance) has gone since the quote, nothing is written at all.
    if (input.totals.couponCode) {
      await reserveCouponUse(connection, input.totals.couponCode, input.customer.phone);
    }

    /**
     * Link the order to a customer record, creating one if this is their first.
     *
     * Neither this app nor the Express one used to do this — `customer_id` was
     * only ever filled in when an admin billed the order. The result was that a
     * paying customer had no account to sign in to, and once an admin created
     * one, their history began from that order rather than their first.
     *
     * Inside the transaction, so an order and its customer are never half
     * written. Null when the phone cannot be canonicalised — the order still
     * goes through; it simply is not attached to an account.
     */
    const customerId = await linkCustomerToOrder(connection, {
      phone: input.customer.phone,
      name: input.customer.name,
      email: input.customer.email,
    });

    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO orders (
         order_number, source, customer_id, customer_name, email, phone,
         address_line1, city, state, postal_code, country, note,
         coupon_code, discount_amount,
         payment_method, payment_status, status,
         subtotal, tax_amount, shipping_amount, total_amount, currency
       ) VALUES (?, 'web', ?, ?, ?, ?, ?, ?, '', '', 'Nepal', ?, ?, ?, ?, 'pending', ?, ?, 0.00, ?, ?, 'NPR')`,
      [
        input.orderNumber,
        customerId,
        input.customer.name,
        input.customer.email,
        input.customer.phone,
        input.customer.address,
        input.customer.city ?? "",
        note || null,
        input.totals.couponCode,
        decimal(input.totals.discountMinor),
        input.paymentMethod,
        pending ? "pending_payment" : "placed",
        decimal(input.totals.subtotalMinor),
        decimal(input.totals.extrasMinor),
        decimal(input.totals.totalMinor),
      ],
    );

    const orderId = result.insertId;

    for (const line of input.lines) {
      await connection.execute(
        `INSERT INTO order_items (
           order_id, product_id, product_name, product_sku,
           unit_price, quantity, line_total
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          line.productId,
          line.name,
          line.sku ?? "",
          decimal(line.priceMinor),
          line.quantity,
          decimal(line.lineTotalMinor),
        ],
      );
    }

    return { id: orderId, orderNumber: input.orderNumber };
  });
}

export interface OrderSummary {
  orderNumber: string;
  customerName: string;
  total: string;
  /** Exact paisa, for matching what a gateway echoes back. */
  totalMinor: number;
  paymentStatus: string;
  status: string;
}

/**
 * One order in full, for the confirmation page.
 *
 * The lookup token is required, not optional. The order number travels in URLs
 * and in a gateway's query string; on its own it is a key anyone can try, which
 * is exactly the IDOR the Express app closed with these tokens.
 *
 * Returns null both for a wrong token and for an order that does not exist, so
 * the response cannot be used to discover which order numbers are real. Unlike
 * the guest path this does NOT filter on status: someone holding the token for
 * an order still awaiting its gateway is entitled to see that it is pending.
 */
/**
 * The customer-facing status ladder, from the admin's `order_statuses`.
 *
 * Loaded here rather than inside `lib/order-lookup.ts`, which is deliberately
 * pure so the check script can exercise the access rules without a database.
 * Ordered by the admin's own arrangement — that order IS the timeline.
 */
async function loadTimelineStatuses(): Promise<TimelineStatus[]> {
  const rows = await query<RowDataPacket & { key: string; label: string; customer_visible: number; is_terminal: number }>(
    "SELECT `key`, label, customer_visible, is_terminal FROM order_statuses ORDER BY sort_order, id",
  );
  return rows.map((r) => ({
    key: r.key,
    label: r.label,
    customerVisible: r.customer_visible === 1,
    isTerminal: r.is_terminal === 1,
  }));
}

export async function loadOrderReceipt(
  orderNumber: string,
  token: string | undefined,
): Promise<OrderView | null> {
  if (!orderNumber || !verifyOrderLookupToken(orderNumber, token)) return null;

  // An order the admin soft-deleted (a duplicate, a test) is gone for the
  // customer too — here, on /order-status and in their account alike.
  const row = await queryOne<FullOrderRow>(
    `SELECT ${ORDER_COLUMNS} FROM orders WHERE order_number = ? AND deleted_at IS NULL LIMIT 1`,
    [orderNumber],
  );
  if (!row) return null;

  const [items, statuses] = await Promise.all([loadItems(row.order_number), loadTimelineStatuses()]);
  return toReceiptView(row, items, statuses);
}

/**
 * One order, for guest lookup on /order-status.
 *
 * The contact is the access control here — there is no token — so the match and
 * the visibility filter run in TypeScript rather than in the WHERE clause. Two
 * reasons: the query cannot then be shaped into an oracle that answers faster
 * for a real order number than a fake one, and the rules stay in a pure module
 * that scripts/check-order-lookup.mts can exercise directly.
 *
 * Every failure — unknown number, wrong contact, hidden status — returns the
 * same null, so a caller learns nothing they did not already know.
 */
export async function lookupOrderByContact(
  orderNumber: string,
  contact: string,
): Promise<OrderView | null> {
  const trimmed = orderNumber.trim().replace(/^#/, "").slice(0, 64);
  if (!trimmed || !contact.trim()) return null;

  const row = await queryOne<FullOrderRow>(
    `SELECT ${ORDER_COLUMNS} FROM orders WHERE order_number = ? AND deleted_at IS NULL LIMIT 1`,
    [trimmed],
  );
  if (!row || !isVisibleStatus(row.status) || !contactMatches(row, contact)) return null;

  const [items, statuses] = await Promise.all([loadItems(row.order_number), loadTimelineStatuses()]);
  return toBuyerSafeView(row, items, statuses);
}

/**
 * One of a signed-in customer's own orders.
 *
 * Ownership is proved **in the query** — `WHERE id = ? AND customer_id = ?` —
 * rather than by fetching and then comparing, so there is no window in which
 * the wrong row exists in memory. The customer id comes from the session, never
 * from the request.
 *
 * Returns null for "not yours" and "does not exist" alike, so the page can 404
 * rather than 403 and the route never confirms another customer's order is
 * real. Hidden statuses are filtered for the same reason they are everywhere
 * else: a gateway-incomplete order is not yet a purchase.
 *
 * Note that `orders.note` is not projected. It is a mixed-trust column — the
 * buyer's gift note sits alongside `[paid]`, `txn:` and `[payment failed: …]`
 * markers this app writes — and the reference filters it with a denylist that
 * leaks the moment a new marker is added. Not selecting it is the version that
 * cannot rot.
 */
export async function loadOrderForCustomer(
  orderId: number,
  customerId: number,
): Promise<OrderView | null> {
  if (!Number.isInteger(orderId) || orderId <= 0) return null;

  const row = await queryOne<FullOrderRow>(
    `SELECT ${ORDER_COLUMNS} FROM orders WHERE id = ? AND customer_id = ? AND deleted_at IS NULL LIMIT 1`,
    [orderId, customerId],
  );
  if (!row || !isVisibleStatus(row.status)) return null;

  // Their own order, so the full phone is theirs to see.
  const [items, statuses] = await Promise.all([loadItems(row.order_number), loadTimelineStatuses()]);
  return toReceiptView(row, items, statuses);
}

/**
 * The thin summary, for the gateway return paths.
 *
 * They need the total to match against what the gateway echoed and nothing
 * else, so they should not pay for the items join.
 */
export async function loadOrderForReceipt(
  orderNumber: string,
  token: string | undefined,
): Promise<OrderSummary | null> {
  if (!orderNumber || !verifyOrderLookupToken(orderNumber, token)) return null;

  const row = await queryOne<OrderRow>(
    `SELECT order_number, customer_name, total_amount, payment_status, status
       FROM orders WHERE order_number = ? LIMIT 1`,
    [orderNumber],
  );
  if (!row) return null;

  return {
    orderNumber: row.order_number,
    customerName: row.customer_name,
    total: formatPrice(row.total_amount) ?? "",
    totalMinor: Math.round(Number(row.total_amount) * 100),
    paymentStatus: row.payment_status,
    status: row.status,
  };
}

/**
 * Promote a gateway order to paid.
 *
 * Returns true only if this call is what transitioned the row. Gateways retry,
 * customers press back, and a success URL can be revisited — so the caller
 * uses the return value to fire the confirmation email and analytics exactly
 * once. Ported from the Express app's `markOrderPaidAndConfirm`.
 *
 * The condition is `payment_status <> 'paid'` rather than `= 'pending'`, so a
 * row that reached `failed` first can still be corrected by a genuine success.
 */
export async function markOrderPaid(
  orderNumber: string,
  details: { transactionId?: string | null; gatewayRef?: string | null } = {},
): Promise<boolean> {
  const trail =
    [details.gatewayRef && `ref:${details.gatewayRef}`, details.transactionId && `txn:${details.transactionId}`]
      .filter(Boolean)
      .join(" ") || "[paid]";

  return transaction(async (connection) => {
    const row = await lockUnpaidOrder(connection, orderNumber);
    if (!row) return false;

    await connection.execute(
      `UPDATE orders
          SET payment_status = 'paid',
              status = 'placed',
              note = CASE WHEN note IS NULL OR note = '' THEN ? ELSE CONCAT(note, '\n', ?) END
        WHERE id = ?`,
      [trail, trail, row.id],
    );

    // A failure gave this order's coupon use back; a genuine success after it
    // means the code was redeemed after all, so the use is taken again.
    if (row.coupon_code && row.status === "payment_failed") {
      await connection.execute("UPDATE coupons SET used_count = used_count + 1 WHERE UPPER(code) = ?", [
        row.coupon_code.toUpperCase(),
      ]);
    }

    await logGatewayEvent(connection, row, "placed", `Payment confirmed by the gateway (${trail})`);
    return true;
  });
}

interface UnpaidOrderRow extends RowDataPacket {
  id: number;
  status: string;
  coupon_code: string | null;
}

/**
 * The order, locked, if it is not already paid. Every gateway transition reads
 * and writes under this lock, so a success and a failure callback racing for
 * one order apply one after the other, never interleaved.
 */
async function lockUnpaidOrder(connection: PoolConnection, orderNumber: string): Promise<UnpaidOrderRow | null> {
  const [rows] = await connection.execute<UnpaidOrderRow[]>(
    `SELECT id, status, coupon_code FROM orders
      WHERE order_number = ? AND payment_status <> 'paid'
      LIMIT 1 FOR UPDATE`,
    [orderNumber],
  );
  return rows[0] ?? null;
}

/**
 * A line on the admin's order timeline. Gateway transitions used to change an
 * order's status with no activity row at all, so the timeline could not say
 * why an order had moved, or when.
 */
async function logGatewayEvent(
  connection: PoolConnection,
  row: UnpaidOrderRow,
  to: string | null,
  message: string,
): Promise<void> {
  await connection.execute(
    `INSERT INTO order_activity (order_id, admin_id, admin_email, event_type, from_status, to_status, message)
     VALUES (?, NULL, NULL, 'status', ?, ?, ?)`,
    [row.id, to ? row.status : null, to, message.slice(0, 500)],
  );
}

/**
 * Record a failed payment.
 *
 * Never overrides a paid row: a failure callback arriving after a success is
 * rare but real, and losing the payment would be far worse than keeping a
 * stale failure notice out of the log.
 *
 * Only for a DEFINITIVE failure — the gateway said no, or the return could not
 * be ours. A verification that merely could not complete is not a failure; see
 * `markPaymentUnconfirmed`.
 */
export async function markOrderFailed(orderNumber: string, reason: string): Promise<void> {
  const line = `[payment failed: ${reason.slice(0, 200)}]`;
  await transaction(async (connection) => {
    const row = await lockUnpaidOrder(connection, orderNumber);
    if (!row) return;

    await connection.execute(
      `UPDATE orders
          SET payment_status = 'failed',
              status = 'payment_failed',
              note = CASE WHEN note IS NULL OR note = '' THEN ? ELSE CONCAT(note, '\n', ?) END
        WHERE id = ?`,
      [line, line, row.id],
    );

    /*
     * The order took one use of its coupon when it was written. A payment that
     * failed is not a redemption, so the use goes back — otherwise a declined
     * card or a closed eSewa tab spends a limited code for good. Only once: a
     * row already failed or cancelled has no use left to return.
     */
    if (row.coupon_code && !(NON_REDEMPTION_STATUSES as readonly string[]).includes(row.status)) {
      await releaseCouponUse(connection, row.coupon_code);
    }

    if (row.status !== "payment_failed") {
      await logGatewayEvent(connection, row, "payment_failed", line);
    }
  });
}

/**
 * The gateway may have taken the money, but we could not confirm it: its
 * verification call timed out or errored, it answered "Pending", or the card
 * is held for fraud review.
 *
 * These used to be recorded as failures. The customer — whose money had very
 * possibly left their account — was told "no charge was made" and invited to
 * pay again, and the order was hidden as `payment_failed` with nothing kept to
 * reconcile it by. Now the order stays `pending_payment` for someone to check
 * against the gateway, the reference goes on the order where they will find it,
 * and the customer is shown their order as awaiting confirmation.
 */
export async function markPaymentUnconfirmed(orderNumber: string, detail: string): Promise<void> {
  const line = `[payment unconfirmed: ${detail.slice(0, 200)}]`;
  await transaction(async (connection) => {
    const row = await lockUnpaidOrder(connection, orderNumber);
    if (!row) return;

    await connection.execute(
      `UPDATE orders
          SET note = CASE WHEN note IS NULL OR note = '' THEN ? ELSE CONCAT(note, '\n', ?) END
        WHERE id = ?`,
      [line, line, row.id],
    );
    await logGatewayEvent(connection, row, null, `${line} Check the payment with the gateway before fulfilling.`);
  });
}
