#!/usr/bin/env node
/**
 * Order email checks.
 *
 * The templates are pure functions, so they can be rendered and asserted
 * without a mail server or a database. What matters is that the founder's
 * alert carries everything needed to act on an order — phone, address, items,
 * and the high-value cash flag ported from the Express app — and that the
 * customer's copy names the order and links to their receipt.
 *
 * Run: npx tsx scripts/check-order-emails.mts
 */
import {
  buildAdminAlertEmail,
  buildCustomerConfirmationEmail,
  type OrderEmailContext,
} from "../lib/emails/order";

const ctx: OrderEmailContext = {
  orderNumber: "SZ-260808-A1B",
  customerName: "Ananya Sharma",
  phone: "9801082897",
  email: "ananya@example.com",
  address: "12 New Road, Ward 22, Kathmandu",
  lines: [
    { name: "Solitaire Halo Ring", sku: "DGR-4210", quantity: 1, lineTotalMinor: 12_500_000 },
    { name: "Petal Drop Earrings", sku: "DGE-1180", quantity: 2, lineTotalMinor: 15_700_000 },
  ],
  subtotalMinor: 28_200_000,
  discountMinor: 10_000,
  extrasMinor: 50_000,
  totalMinor: 28_240_000,
  couponCode: "FREE",
  paymentMethod: "cod",
  paymentStatus: "pending",
  receiptUrl: "https://next.sazunajewellers.com/checkout/confirmation?order=SZ-260808-A1B&token=abc",
  brandName: "Sazuna Jewellers",
  brandShort: "Sazuna",
  supportPhone: "+977 9801082897",
};

const admin = buildAdminAlertEmail(ctx);
const customer = buildCustomerConfirmationEmail(ctx);
const small = buildAdminAlertEmail({ ...ctx, totalMinor: 400_000 });

const checks: [string, boolean][] = [
  ["admin subject carries order and total", admin.subject.includes("SZ-260808-A1B") && admin.subject.includes("2,82,400")],
  ["high-value cash order is flagged", admin.text.includes("HIGH-VALUE") && admin.html.includes("High-value cash order")],
  ["ordinary cash order is not flagged", !small.text.includes("HIGH-VALUE")],
  ["admin has phone and address", admin.text.includes("9801082897") && admin.text.includes("New Road")],
  ["admin lists every item", admin.text.includes("Solitaire Halo Ring") && admin.text.includes("Petal Drop Earrings")],
  ["admin shows the promo", admin.text.includes("FREE") && admin.text.includes("−")],
  ["customer subject names the order", customer.subject === "Your Sazuna order SZ-260808-A1B is confirmed"],
  ["customer greeted by first name", customer.text.startsWith("Hi Ananya,")],
  ["customer told the cash amount", customer.text.includes("in cash when it arrives")],
  ["receipt link is present", customer.html.includes("token=abc")],
  ["no unresolved template holes", !admin.html.includes("undefined") && !customer.html.includes("undefined")],
  ["html is a complete document", customer.html.startsWith("<!doctype html>") && customer.html.trimEnd().endsWith("</html>")],
  ["uses the Ceremony palette", customer.html.includes("#7A2226") && !customer.html.includes("#84292B")],
  ["escapes customer-supplied text", buildAdminAlertEmail({ ...ctx, customerName: '<script>x</script>' }).html.includes("&lt;script&gt;")],
];

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}
console.log(`\n${checks.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
