import { formatPrice } from "./format";

/**
 * Guest order lookup — the matching and projection rules, ported from the
 * Express app's server/services/order-lookup.js.
 *
 * This backs the only public surface that returns order details without the
 * HMAC token minted at checkout. It is gated on knowing the order number AND
 * the phone or email used at checkout, so **the contact check is the security
 * boundary** — everything here exists to keep that check strict and the
 * response free of anything the requester has not already proved they know.
 *
 * Three rules, in order of importance:
 *
 *   1. One response for every failure. A wrong order number, a right number
 *      with the wrong phone, and a hidden-status order all produce the identical
 *      not-found result. Anything else turns this into an oracle that confirms
 *      which order numbers are real.
 *   2. Never echo back the channel that was not used to match. Looking an order
 *      up by phone must not hand over the customer's email — that turns one
 *      known fact into two. The phone comes back masked.
 *   3. Only statuses a customer should see.
 *
 * Deliberately pure: no database, no `server-only`, no I/O. That is what lets
 * scripts/check-order-lookup.mts import and exercise it directly, which matters
 * more here than anywhere else in the codebase.
 *
 * One thing is better than in the Express app, and the comments there should
 * not be read across: its order numbers were sequential, so guessing one was
 * trivial. `generateOrderNumber` here is date-prefixed and random. The contact
 * check is still the boundary; the enumeration surface behind it is just
 * smaller.
 */

/**
 * Gateway-incomplete orders are not yet real purchases, and `processing` is a
 * legacy value no live row should carry. Same list as the Express customer
 * portal, so two customer-facing surfaces cannot disagree about what exists.
 */
export const HIDDEN_ORDER_STATUSES = ["pending_payment", "payment_failed", "processing"];

/**
 * Nepali mobile numbers are stored bare and 10 digits (9803999935); buyers type
 * them every other way — with +977, with spaces or dashes, sometimes with a
 * leading zero. Both sides are reduced to the same 10 digits before comparing,
 * or a customer typing their number the way their own phone displays it is told
 * their order does not exist.
 */
export function normalisePhone(value: unknown): string {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  // Strip a country code only when something plausible remains behind it —
  // "977" alone, or a number already 10 digits, must be left intact.
  if (digits.length > 10 && digits.startsWith("977")) digits = digits.slice(3);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits.slice(-10);
}

export function normaliseEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/** Enough of the phone to confirm "yes, that's my order", and no more. */
export function maskPhone(value: unknown): string {
  const digits = normalisePhone(value);
  if (digits.length !== 10) return "";
  return `+977 ${digits.slice(0, 2)}XXXXXX${digits.slice(-2)}`;
}

export function isVisibleStatus(status: unknown): boolean {
  return !HIDDEN_ORDER_STATUSES.includes(String(status ?? "").toLowerCase());
}

/** The columns the lookup reads. Kept structural so the check script can fake one. */
export interface OrderRowLike {
  order_number: string;
  status: string;
  payment_method: string;
  payment_status: string;
  created_at: Date | string | null;
  updated_at: Date | string | null;
  customer_name: string;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  city: string | null;
  postal_code?: string | null;
  country?: string | null;
  subtotal: string;
  discount_amount: string;
  shipping_amount: string;
  total_amount: string;
}

export interface OrderItemRowLike {
  product_name: string;
  product_sku: string | null;
  quantity: number;
  line_total: string;
}

/**
 * Does this contact string identify this order?
 *
 * Strict on purpose: an empty contact never matches, and an order with no
 * stored phone can never be matched "by empty phone" — either would let a bare
 * order number through.
 */
export function contactMatches(order: OrderRowLike | null, contact: unknown): boolean {
  if (!order) return false;
  const raw = String(contact ?? "").trim();
  if (!raw) return false;

  if (raw.includes("@")) {
    const stored = normaliseEmail(order.email);
    return Boolean(stored) && stored === normaliseEmail(raw);
  }

  const stored = normalisePhone(order.phone);
  const given = normalisePhone(raw);
  // A partial number must not match: requiring all 10 digits stops "98" from
  // matching every order in the table.
  return stored.length === 10 && given.length === 10 && stored === given;
}

export interface TimelineStep {
  key: string;
  label: string;
  done: boolean;
  current: boolean;
  /** Only ever a timestamp the row actually holds. Null otherwise. */
  at: string | null;
}

const LADDER = ["placed", "confirmed", "shipped", "delivered"];
const STATUS_TO_STEP: Record<string, number> = {
  new: 0, placed: 0, pending: 0,
  confirmed: 1, packed: 1, paid: 1,
  shipped: 2, dispatched: 2, out_for_delivery: 2,
  delivered: 3, completed: 3,
};
const TERMINAL = new Set(["cancelled", "refunded", "returned"]);

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * The status ladder the storefront draws as a timeline.
 *
 * `done` comes from position, so an order that skipped a step still shows the
 * earlier ones complete rather than leaving gaps. A cancelled order gets its
 * own single-step ladder — walking it through "Shipped" would be a lie.
 *
 * Only `created_at` and `updated_at` are ever claimed. Deriving a "shipped at"
 * from `updated_at` for every step would print four identical times and read as
 * fabricated tracking.
 */
export function buildTimeline(order: OrderRowLike): TimelineStep[] {
  const status = String(order.status ?? "").toLowerCase();

  if (TERMINAL.has(status)) {
    return [
      {
        key: status,
        label: status.charAt(0).toUpperCase() + status.slice(1),
        done: true,
        current: true,
        at: iso(order.updated_at),
      },
    ];
  }

  const reached = STATUS_TO_STEP[status];
  const index = Number.isInteger(reached) ? reached : 0;

  return LADDER.map((key, i) => ({
    key,
    label: key.charAt(0).toUpperCase() + key.slice(1),
    done: i <= index,
    current: i === index,
    at: i === 0 ? iso(order.created_at) : i === index ? iso(order.updated_at) : null,
  }));
}

export interface OrderLine {
  name: string;
  sku: string | null;
  quantity: number;
  lineTotal: string;
}

/** What both the confirmation page and the status page render. */
export interface OrderView {
  orderNumber: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  customerName: string;
  /** Masked on the guest projection, full on the receipt. */
  phone: string;
  /** Present only on the receipt projection. Never on the guest one. */
  email?: string;
  address: string[];
  items: OrderLine[];
  totals: { subtotal: string; discount: string | null; extras: string | null; total: string };
  timeline: TimelineStep[];
  placedAt: string | null;
}

/**
 * The address, as lines to print.
 *
 * Drops anything with no alphanumeric content, not just empty strings. Orders
 * migrated from the old admin carry "-" in `city` and `postal_code` where the
 * field was skipped, and a delivery block reading "- -" looks like a rendering
 * fault rather than a missing value.
 */
function lines(order: OrderRowLike): string[] {
  // Anything with no letter or digit is not a value. Orders migrated from the
  // old admin carry "-" where a field was skipped.
  const clean = (value: unknown) => {
    const text = String(value ?? "").trim();
    return /[\p{L}\p{N}]/u.test(text) ? text : "";
  };

  const street = clean(order.address_line1);
  const locality = [clean(order.city), clean(order.postal_code)].filter(Boolean).join(" ");
  return [street, locality].filter(Boolean);
}

function money(value: string): string {
  return formatPrice(value) ?? "";
}

function positive(value: string): string | null {
  return Number(value) > 0 ? money(value) : null;
}

function shared(order: OrderRowLike, items: OrderItemRowLike[]) {
  return {
    orderNumber: order.order_number,
    status: order.status,
    paymentMethod: order.payment_method,
    paymentStatus: order.payment_status,
    customerName: order.customer_name,
    address: lines(order),
    items: items.map((item) => ({
      name: item.product_name,
      sku: item.product_sku || null,
      quantity: Number(item.quantity),
      lineTotal: money(item.line_total),
    })),
    totals: {
      subtotal: money(order.subtotal),
      discount: positive(order.discount_amount),
      extras: positive(order.shipping_amount),
      total: money(order.total_amount),
    },
    timeline: buildTimeline(order),
    placedAt: iso(order.created_at),
  };
}

/**
 * The receipt projection — for the token-gated confirmation page.
 *
 * The reader already proved they hold the HMAC minted for this order at
 * checkout, so this may carry the full phone.
 */
export function toReceiptView(order: OrderRowLike, items: OrderItemRowLike[]): OrderView {
  return { ...shared(order, items), phone: String(order.phone ?? "") };
}

/**
 * The guest projection — for order-status lookup.
 *
 * An allowlist rather than a delete-list, so a column added to `orders` later
 * cannot leak through by accident. Email is omitted entirely and the phone is
 * masked; see rule 2 at the top of this file.
 */
export function toBuyerSafeView(order: OrderRowLike, items: OrderItemRowLike[]): OrderView {
  return { ...shared(order, items), phone: maskPhone(order.phone) };
}
