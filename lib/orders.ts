import "server-only";

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { queryOne, transaction } from "./db";
import { formatPrice } from "./format";
import type { CartLine } from "./cart";

interface OrderRow extends RowDataPacket {
  order_number: string;
  customer_name: string;
  total_amount: string;
  payment_status: string;
  status: string;
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
  paymentMethod: "cod" | "esewa" | "cybersource";
}): Promise<CreatedOrder> {
  if (!input.lines.length) throw new Error("Cannot create an order with no lines");

  // Card and wallet orders are not placed until the gateway says so; cash is.
  const pending = input.paymentMethod !== "cod";

  return transaction(async (connection) => {
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO orders (
         order_number, source, customer_name, email, phone,
         address_line1, city, state, postal_code, country, note,
         coupon_code, discount_amount,
         payment_method, payment_status, status,
         subtotal, tax_amount, shipping_amount, total_amount, currency
       ) VALUES (?, 'web', ?, ?, ?, ?, ?, '', '', 'Nepal', ?, ?, ?, ?, 'pending', ?, ?, 0.00, ?, ?, 'NPR')`,
      [
        input.orderNumber,
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
  paymentStatus: string;
  status: string;
}

/**
 * One order, by its number.
 *
 * Deliberately returns nothing identifying beyond the name already typed by
 * whoever placed it — the order number is the only key, and it appears in
 * URLs, so this must not become a lookup for someone else's address.
 */
export async function getOrderByNumber(orderNumber: string): Promise<OrderSummary | null> {
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
    paymentStatus: row.payment_status,
    status: row.status,
  };
}

/** Mark a gateway order paid or failed. Idempotent — gateways retry. */
export async function settleOrder(
  orderNumber: string,
  outcome: "paid" | "failed",
): Promise<void> {
  await transaction(async (connection) => {
    await connection.execute(
      `UPDATE orders
          SET payment_status = ?, status = ?
        WHERE order_number = ? AND payment_status = 'pending'`,
      [outcome, outcome === "paid" ? "placed" : "payment_failed", orderNumber],
    );
  });
}
