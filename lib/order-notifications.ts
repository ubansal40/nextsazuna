import "server-only";

import type { RowDataPacket } from "mysql2";
import { query, queryOne } from "./db";
import { getContentBlock } from "./content";
import { alertRecipients, isEmailConfigured, sendMail } from "./email";
import { buildAdminAlertEmail, buildCustomerConfirmationEmail, type OrderEmailContext } from "./emails/order";
import { orderLookupToken } from "./order-tokens";
import { siteOrigin } from "./site-url";

/**
 * Order notifications.
 *
 * Called once per order, at the moment it becomes real: immediately for cash,
 * and on the transition to paid for a gateway. The caller gates that with the
 * boolean `markOrderPaid` returns, so a retried callback cannot send twice.
 *
 * Nothing here throws. An order that exists must never be undone, retried or
 * hidden because a mail server was slow.
 */

interface OrderRow extends RowDataPacket {
  id: number;
  order_number: string;
  customer_name: string;
  email: string;
  phone: string;
  address_line1: string;
  coupon_code: string | null;
  discount_amount: string;
  shipping_amount: string;
  subtotal: string;
  total_amount: string;
  payment_method: string;
  payment_status: string;
}

interface ItemRow extends RowDataPacket {
  product_name: string;
  product_sku: string;
  quantity: number;
  line_total: string;
}

const minor = (value: string | number) => Math.round(Number(value) * 100);

async function buildContext(orderNumber: string): Promise<OrderEmailContext | null> {
  const order = await queryOne<OrderRow>(
    `SELECT id, order_number, customer_name, email, phone, address_line1,
            coupon_code, discount_amount, shipping_amount, subtotal, total_amount,
            payment_method, payment_status
       FROM orders WHERE order_number = ? LIMIT 1`,
    [orderNumber],
  );
  if (!order) return null;

  const items = await query<ItemRow>(
    `SELECT product_name, product_sku, quantity, line_total
       FROM order_items WHERE order_id = ? ORDER BY id`,
    [order.id],
  );

  const identity = await getContentBlock<Record<string, unknown>>("site_identity");
  const text = (value: unknown, fallback: string) =>
    typeof value === "string" && value.trim() ? value.trim() : fallback;

  const origin = await siteOrigin();
  const token = orderLookupToken(order.order_number);

  return {
    orderNumber: order.order_number,
    customerName: order.customer_name,
    phone: order.phone,
    email: order.email,
    address: order.address_line1,
    lines: items.map((item) => ({
      name: item.product_name,
      sku: item.product_sku || null,
      quantity: item.quantity,
      lineTotalMinor: minor(item.line_total),
    })),
    subtotalMinor: minor(order.subtotal),
    discountMinor: minor(order.discount_amount),
    extrasMinor: minor(order.shipping_amount),
    totalMinor: minor(order.total_amount),
    couponCode: order.coupon_code,
    paymentMethod: order.payment_method,
    paymentStatus: order.payment_status,
    receiptUrl: `${origin}/checkout/confirmation?order=${encodeURIComponent(order.order_number)}&token=${encodeURIComponent(token)}`,
    brandName: text(identity?.brand_name, "Sazuna Jewellers"),
    brandShort: text(identity?.brand_short, "Sazuna"),
    supportPhone: text(identity?.phone, "") || null,
  };
}

/**
 * Send the admin alert and, when there is an address to send it to, the
 * customer's confirmation.
 */
export async function notifyOrderPlaced(orderNumber: string): Promise<void> {
  if (!isEmailConfigured()) return;

  try {
    const context = await buildContext(orderNumber);
    if (!context) return;

    const recipients = alertRecipients();
    const admin = buildAdminAlertEmail(context);
    const customer = buildCustomerConfirmationEmail(context);

    await Promise.all([
      recipients.length
        ? sendMail({ ...admin, to: recipients, replyTo: context.email || undefined })
        : Promise.resolve("skipped" as const),
      // Email is optional at checkout, so plenty of orders have none.
      context.email ? sendMail({ ...customer, to: context.email }) : Promise.resolve("skipped" as const),
    ]);
  } catch (error) {
    console.error("[order-notifications] failed", { orderNumber, error });
  }
}
