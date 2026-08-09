#!/usr/bin/env node
/**
 * Guest order lookup checks.
 *
 * The contact check IS the access control on /order-status — it is the only
 * public surface that returns order details without the HMAC token minted at
 * checkout. There is no way to test that end to end without a live order and a
 * live database, which is exactly why lib/order-lookup.ts is pure: the rules
 * that matter can be exercised directly, here, on every commit.
 *
 * What this pins down: that a partial phone never matches, that the country
 * code and a leading zero are normalised away rather than causing a false
 * negative, that hidden statuses stay hidden, and — most importantly — that the
 * buyer-safe projection cannot carry an email address.
 *
 * Run: npx tsx scripts/check-order-lookup.mts
 */
import {
  buildTimeline,
  contactMatches,
  isVisibleStatus,
  maskPhone,
  normalisePhone,
  toBuyerSafeView,
  toReceiptView,
  type OrderItemRowLike,
  type OrderRowLike,
} from "../lib/order-lookup";
import { rateLimit, resetRateLimits, requestIp } from "../lib/rate-limit";

const order: OrderRowLike = {
  order_number: "SZ-260808-A1B",
  status: "shipped",
  payment_method: "cod",
  payment_status: "pending",
  created_at: "2026-08-01T08:14:00Z",
  updated_at: "2026-08-03T05:32:00Z",
  customer_name: "Ananya Sharma",
  email: "Ananya@Example.com",
  phone: "9803999935",
  address_line1: "12 New Road, Ward 22",
  city: "Kathmandu",
  postal_code: "44600",
  country: "Nepal",
  subtotal: "203500.00",
  discount_amount: "10000.00",
  shipping_amount: "0.00",
  total_amount: "193500.00",
};

const items: OrderItemRowLike[] = [
  { product_name: "Solitaire Halo Ring", product_sku: "DGR-4210", quantity: 1, line_total: "125000.00" },
  { product_name: "Petal Drop Earrings", product_sku: "DGE-1180", quantity: 1, line_total: "78500.00" },
];

/**
 * The seeded `order_statuses` ladder from migration 0013, as the timeline sees
 * it. The steps are now the admin's own statuses rather than a hardcoded
 * placed/confirmed/shipped/delivered — "shipped" and "delivered" were never
 * values this system could hold.
 */
const STATUSES = [
  { key: "pending_payment", label: "Pending payment", customerVisible: false, isTerminal: false },
  { key: "payment_failed", label: "Payment failed", customerVisible: false, isTerminal: true },
  { key: "placed", label: "Placed", customerVisible: true, isTerminal: false },
  { key: "confirmed", label: "Confirmed", customerVisible: true, isTerminal: false },
  { key: "billed", label: "Billed", customerVisible: true, isTerminal: false },
  { key: "processing", label: "Processing", customerVisible: false, isTerminal: false },
  { key: "completed", label: "Completed", customerVisible: true, isTerminal: true },
  { key: "cancelled", label: "Cancelled", customerVisible: true, isTerminal: true },
];

const guest = toBuyerSafeView(order, items, STATUSES);
const receipt = toReceiptView(order, items, STATUSES);
const cancelled = buildTimeline({ ...order, status: "cancelled" }, STATUSES);
const billed = buildTimeline({ ...order, status: "billed" }, STATUSES);

resetRateLimits();
const burst = Array.from({ length: 6 }, () => rateLimit("ip:1.2.3.4", { limit: 5, windowMs: 60_000 }));

const checks: [string, boolean][] = [
  // --- phone normalisation -------------------------------------------------
  ["bare 10-digit phone matches", contactMatches(order, "9803999935")],
  ["+977 prefix matches", contactMatches(order, "+977 9803999935")],
  ["leading zero matches", contactMatches(order, "09803999935")],
  ["dashes and spaces match", contactMatches(order, "980-399 9935")],
  ["a 9-digit prefix does NOT match", !contactMatches(order, "980399993")],
  ["a 2-digit prefix does NOT match", !contactMatches(order, "98")],
  ["an empty contact never matches", !contactMatches(order, "") && !contactMatches(order, "   ")],
  ["a different number does not match", !contactMatches(order, "9800000000")],
  ["an order with no stored phone cannot be matched by empty", !contactMatches({ ...order, phone: null }, "")],
  ["normalisePhone keeps a bare 977 intact", normalisePhone("977") === "977"],

  // --- email ---------------------------------------------------------------
  ["email matches case-insensitively", contactMatches(order, "ananya@example.com")],
  ["a different email does not match", !contactMatches(order, "someone@example.com")],
  ["an order with no stored email is not matched by an email", !contactMatches({ ...order, email: null }, "a@b.com")],

  // --- visibility ----------------------------------------------------------
  ["pending_payment is hidden", !isVisibleStatus("pending_payment")],
  ["payment_failed is hidden", !isVisibleStatus("payment_failed")],
  ["processing is hidden", !isVisibleStatus("processing")],
  ["placed is visible", isVisibleStatus("placed")],
  ["shipped is visible", isVisibleStatus("shipped")],

  // --- the projection ------------------------------------------------------
  ["guest view carries NO email key", !Object.keys(guest).includes("email")],
  ["guest view masks the phone", guest.phone === "+977 98XXXXXX35"],
  ["guest view never contains the raw phone", !JSON.stringify(guest).includes("9803999935")],
  ["guest view never contains the email", !JSON.stringify(guest).toLowerCase().includes("ananya@example.com")],
  ["receipt view keeps the full phone", receipt.phone === "9803999935"],
  ["both views list every item", guest.items.length === 2 && receipt.items.length === 2],
  ["money is formatted, not raw decimal", guest.totals.total.includes("रु") && !guest.totals.total.includes(".00")],
  ["a zero extra is dropped rather than shown as free", guest.totals.extras === null],
  ["a real discount is kept", guest.totals.discount !== null],
  ["maskPhone refuses a short number", maskPhone("98039") === ""],

  // --- timeline ------------------------------------------------------------
  ["the ladder is the customer-visible statuses, in the admin's order", billed.map((s) => s.key).join(">") === "placed>confirmed>billed>completed"],
  [
    "an alternative exit after the happy path is not drawn as a future step",
    !billed.some((s) => s.key === "cancelled"),
  ],
  ["a hidden status never appears as a step", !billed.some((s) => ["pending_payment", "payment_failed", "processing"].includes(s.key))],
  ["billed marks the first three steps done", billed.filter((s) => s.done).length === 3],
  ["billed is the current step", billed.find((s) => s.current)?.key === "billed"],
  ["a later step is not claimed", billed.at(-1)?.done === false],
  ["only the first and current steps carry a time", billed.filter((s) => s.at).length === 2],
  ["steps carry the admin's label, not a capitalised key", billed[0].label === "Placed"],
  ["cancelled collapses to one step", cancelled.length === 1 && cancelled[0].key === "cancelled"],
  ["a terminal status does not draw a ladder behind it", cancelled[0].current && cancelled[0].done],
  ["an unknown status falls back to the first step", buildTimeline({ ...order, status: "??" }, STATUSES)[0].current],
  [
    "an order on a customer-hidden status shows no invented progress",
    buildTimeline({ ...order, status: "pending_payment" }, STATUSES).filter((s) => s.done).length === 1,
  ],
  ["no statuses at all yields no timeline rather than a fake one", buildTimeline(order, []).length === 0],
  [
    "a renamed status renames the step",
    buildTimeline({ ...order, status: "billed" }, STATUSES.map((s) => (s.key === "billed" ? { ...s, label: "Invoice raised" } : s)))
      .find((s) => s.current)?.label === "Invoice raised",
  ],

  // --- rate limit ----------------------------------------------------------
  ["five attempts pass", burst.slice(0, 5).every((r) => r.ok)],
  ["the sixth is refused", burst[5].ok === false && burst[5].retryAfter > 0],
  ["a different key is unaffected", rateLimit("ip:5.6.7.8", { limit: 5, windowMs: 60_000 }).ok],
  ["the window reopens", rateLimit("ip:1.2.3.4", { limit: 5, windowMs: 60_000, now: Date.now() + 61_000 }).ok],

  // --- forwarded-for -------------------------------------------------------
  [
    "requestIp reads the LAST hop, not the client-supplied first",
    requestIp(new Headers({ "x-forwarded-for": "1.1.1.1, 203.0.113.9" })) === "203.0.113.9",
  ],
  ["requestIp falls back to x-real-ip", requestIp(new Headers({ "x-real-ip": "203.0.113.9" })) === "203.0.113.9"],
  ["requestIp never returns empty", requestIp(new Headers()) === "unknown"],
];

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}
console.log(`\n${checks.length - failed} passed, ${failed} failed`);
if (failed) {
  console.error(
    "\n✗ order lookup checks FAILED — /order-status is the only public surface that\n" +
      "  returns order details without the checkout token, and these rules are its\n" +
      "  access control. Fix lib/order-lookup.ts rather than relaxing a check.",
  );
}
process.exit(failed ? 1 : 0);
