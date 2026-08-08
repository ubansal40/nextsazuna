import "server-only";

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { linkCustomerToOrder } from "./customers";
import { execute, query, queryOne, transaction } from "./db";
import { formatPrice } from "./format";
import {
  contactMatches,
  isVisibleStatus,
  toBuyerSafeView,
  toReceiptView,
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

/** Paisa to the DECIMAL string the money columns expect. */
function decimal(minor: number): string {
  return (minor / 100).toFixed(2);
}

/**
 * Human-facing order number.
 *
 * Date-prefixed and random rather than sequential: a guessable order number
 * plus an order-status page is an enumeration hole, and this one is printed on
 * invoices where the sequence would leak volume.
 */
export function generateOrderNumber(now: Date = new Date()): string {
  const stamp = now.toISOString().slice(2, 10).replace(/-/g, "");
  const random = Math.floor(Math.random() * 46656)
    .toString(36)
    .toUpperCase()
    .padStart(3, "0");
  return `SZ-${stamp}-${random}`;
}

export async function createOrder(input: {
  orderNumber: string;
  customer: OrderCustomer;
  lines: CartLine[];
  totals: OrderTotals;
  /** Must be a value the `orders.payment_method` enum accepts. */
  paymentMethod: "cod" | "esewa" | "khalti" | "cybersource";
}): Promise<CreatedOrder> {
  if (!input.lines.length) throw new Error("Cannot create an order with no lines");

  // Card and wallet orders are not placed until the gateway says so; cash is.
  const pending = input.paymentMethod !== "cod";

  return transaction(async (connection) => {
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
        input.customer.note ?? null,
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

    // Only count a coupon once the order it discounted actually exists.
    if (input.totals.couponCode) {
      await connection.execute(
        "UPDATE coupons SET used_count = used_count + 1 WHERE UPPER(code) = ?",
        [input.totals.couponCode.toUpperCase()],
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
export async function loadOrderReceipt(
  orderNumber: string,
  token: string | undefined,
): Promise<OrderView | null> {
  if (!orderNumber || !verifyOrderLookupToken(orderNumber, token)) return null;

  const row = await queryOne<FullOrderRow>(
    `SELECT ${ORDER_COLUMNS} FROM orders WHERE order_number = ? LIMIT 1`,
    [orderNumber],
  );
  if (!row) return null;

  return toReceiptView(row, await loadItems(row.order_number));
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
    `SELECT ${ORDER_COLUMNS} FROM orders WHERE order_number = ? LIMIT 1`,
    [trimmed],
  );
  if (!row || !isVisibleStatus(row.status) || !contactMatches(row, contact)) return null;

  return toBuyerSafeView(row, await loadItems(row.order_number));
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

  const result = await execute(
    `UPDATE orders
        SET payment_status = 'paid',
            status = 'placed',
            note = CASE WHEN note IS NULL OR note = '' THEN ? ELSE CONCAT(note, '\n', ?) END
      WHERE order_number = ? AND payment_status <> 'paid'`,
    [trail, trail, orderNumber],
  );

  return result.affectedRows > 0;
}

/**
 * Record a failed payment.
 *
 * Never overrides a paid row: a failure callback arriving after a success is
 * rare but real, and losing the payment would be far worse than keeping a
 * stale failure notice out of the log.
 */
export async function markOrderFailed(orderNumber: string, reason: string): Promise<void> {
  const line = `[payment failed: ${reason.slice(0, 200)}]`;
  await execute(
    `UPDATE orders
        SET payment_status = 'failed',
            status = 'payment_failed',
            note = CASE WHEN note IS NULL OR note = '' THEN ? ELSE CONCAT(note, '\n', ?) END
      WHERE order_number = ? AND payment_status <> 'paid'`,
    [line, line, orderNumber],
  );
}
