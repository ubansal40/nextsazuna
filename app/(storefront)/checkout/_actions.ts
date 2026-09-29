"use server";

import { after } from "next/server";
import { priceCart } from "@/lib/cart";
import { isCouponUnavailable } from "@/lib/coupons";
import { notifyOrderPlaced } from "@/lib/order-notifications";
import { orderLookupToken } from "@/lib/order-tokens";
import { siteOrigin } from "@/lib/site-url";
import { MAX_QUANTITY, type CartEntry } from "@/lib/cart-storage";
import { ORDER_FIELD_LIMITS } from "@/lib/order-fields";
import { createOrder, generateOrderNumber, isDuplicateOrderNumber, markOrderFailed } from "@/lib/orders";
import { listCheckoutMethods, type CheckoutMethod, type MethodCode } from "@/lib/payments/config";
import { buildEsewaForm } from "@/lib/payments/esewa";
import { buildCardForm } from "@/lib/payments/cybersource";
import { initiateKhaltiPayment } from "@/lib/payments/khalti";
import { formatPrice } from "@/lib/format";
import { COUPON_MESSAGE } from "@/lib/coupon-messages";

/**
 * Checkout.
 *
 * The browser sends product ids, quantities, a promo code, a payment method and
 * the customer's details. Every amount — line prices, discount, gift wrap,
 * surcharge, total — is derived here from the catalog, the coupons table and
 * the payment configuration. Nothing that arrives is treated as an amount.
 */

export interface CheckoutQuote {
  lines: {
    productId: number;
    name: string;
    sku: string | null;
    imageUrl: string | null;
    quantity: number;
    price: string;
    /** False for a piece that sold out after it went in the bag. */
    inStock: boolean;
  }[];
  methods: CheckoutMethod[];
  couponApplied: boolean;
  couponCode: string | null;
  couponError: string | null;
  subtotal: string;
  discount: string;
  giftWrap: string;
  surcharge: string;
  total: string;
  totalMinor: number;
  itemCount: number;
}

function cleanEntries(entries: unknown): CartEntry[] {
  return Array.isArray(entries)
    ? entries
        .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === "object")
        .map((e) => ({ productId: Number(e.productId), quantity: Number(e.quantity) }))
        .filter((e) => Number.isInteger(e.productId) && e.productId > 0)
        .map((e) => ({
          ...e,
          quantity: Number.isFinite(e.quantity)
            ? Math.min(Math.max(Math.floor(e.quantity), 1), MAX_QUANTITY)
            : 1,
        }))
        .slice(0, 50)
    : [];
}

/**
 * Price a checkout, including the surcharge for the chosen method.
 *
 * Shared by the page render and the order placement below, so the figure the
 * customer agrees to and the figure written to the order come from one path.
 */
async function quote(input: {
  entries: CartEntry[];
  code?: string;
  giftWrap?: boolean;
  method: string;
  phone?: string | null;
}) {
  const methods = await listCheckoutMethods();
  const method = methods.find((m) => m.code === input.method) ?? methods[0];

  const cart = await priceCart(input.entries, {
    code: input.code,
    giftWrap: input.giftWrap,
    phone: input.phone,
  });

  // Surcharge applies to what is actually being charged — after the discount,
  // and including gift wrap, since that is part of the amount taken. Whole
  // rupees, like every figure the customer is shown: 3% of रु 11,111 is
  // 333.33, and a total with paise is printed rounded and charged unrounded.
  const chargeable = cart.totals.totalMinor;
  const surchargeMinor = method
    ? Math.round((chargeable * method.surchargePercent) / 10_000) * 100
    : 0;

  return {
    cart,
    methods,
    method,
    surchargeMinor,
    totalMinor: chargeable + surchargeMinor,
  };
}

export async function quoteCheckout(
  entries: unknown,
  options: { code?: string; giftWrap?: boolean; method?: string; phone?: string } = {},
): Promise<CheckoutQuote> {
  const priced = await quote({
    entries: cleanEntries(entries),
    code: typeof options.code === "string" ? options.code.slice(0, 50) : undefined,
    giftWrap: options.giftWrap === true,
    method: typeof options.method === "string" ? options.method : "cod",
    // Only so a per-customer limit can be reported at the field rather than at
    // the button. `placeOrder` re-checks with the phone it validates itself, so
    // a browser omitting or faking this cannot buy a second discount.
    phone: typeof options.phone === "string" ? options.phone : null,
  });

  const coupon = priced.cart.coupon;

  return {
    lines: priced.cart.lines.map((line) => ({
      productId: line.productId,
      name: line.name,
      sku: line.sku,
      imageUrl: line.imageUrl,
      quantity: line.quantity,
      price: line.price,
      inStock: line.inStock,
    })),
    methods: priced.methods,
    couponApplied: coupon?.ok === true,
    couponCode: coupon?.ok ? coupon.code : null,
    couponError: coupon && !coupon.ok ? COUPON_MESSAGE[coupon.reason] : null,
    subtotal: priced.cart.totals.subtotal,
    discount: priced.cart.totals.discount,
    giftWrap: priced.cart.totals.giftWrap,
    surcharge: formatPrice(priced.surchargeMinor / 100) ?? "",
    total: formatPrice(priced.totalMinor / 100) ?? "",
    totalMinor: priced.totalMinor,
    itemCount: priced.cart.count,
  };
}

export interface PlaceOrderInput {
  entries: unknown;
  /**
   * The total, in paisa, that the customer was shown when they agreed to this
   * order — `CheckoutQuote.totalMinor` from the quote on screen. Re-pricing
   * here must come to exactly this figure or the order is refused: the amount
   * charged and the amount displayed are the same number or there is no order.
   */
  expectedTotalMinor: number;
  code?: string;
  giftWrap?: boolean;
  method: string;
  name: string;
  phone: string;
  email?: string;
  address: string;
}

export type PlaceOrderResult =
  | { ok: true; kind: "placed"; orderNumber: string; token: string }
  /** Auto-submitting form post — eSewa and CyberSource. */
  | {
      ok: true;
      kind: "redirect";
      orderNumber: string;
      token: string;
      action: string;
      fields: Record<string, string>;
    }
  /** Plain navigation — Khalti hands back a URL it has already prepared. */
  | { ok: true; kind: "navigate"; orderNumber: string; token: string; url: string }
  /**
   * "changed" — the bag re-priced to something other than the quoted total, so
   * nothing was written. Recoverable: the caller re-quotes and shows the new
   * figure. Never silently proceed past it.
   *
   * "sold-out" — a piece in the bag is no longer in stock. Nothing was written.
   */
  | { ok: false; error: "empty" | "invalid" | "unavailable" | "changed" | "sold-out" | "failed" };

/** Enough to reach someone about a delivery, not a format police. */
function validPhone(phone: string): boolean {
  return phone.replace(/\D/g, "").length >= 7;
}

/** Attempts at a fresh order number before giving up. See `generateOrderNumber`. */
const ORDER_NUMBER_ATTEMPTS = 5;

export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const name = (input.name ?? "").trim();
  const address = (input.address ?? "").trim();
  const phone = (input.phone ?? "").trim();
  const email = (input.email ?? "").trim();

  if (!name || !address || !validPhone(phone)) return { ok: false, error: "invalid" };
  // The form's inputs carry the same limits, so only a hand-built request
  // reaches this — but it must be refused, not written and truncated or thrown.
  if (
    name.length > ORDER_FIELD_LIMITS.name ||
    address.length > ORDER_FIELD_LIMITS.address ||
    phone.length > ORDER_FIELD_LIMITS.phone ||
    email.length > ORDER_FIELD_LIMITS.email
  ) {
    return { ok: false, error: "invalid" };
  }

  const entries = cleanEntries(input.entries);
  if (!entries.length) return { ok: false, error: "empty" };

  try {
    const priced = await quote({
      entries,
      code: typeof input.code === "string" ? input.code.slice(0, 50) : undefined,
      giftWrap: input.giftWrap === true,
      method: input.method,
      // The phone this function validated, not one the browser asserted in a
      // quote. This is where a per-customer coupon limit is actually enforced.
      phone,
    });

    if (!priced.cart.lines.length) return { ok: false, error: "empty" };
    // The chosen method must be one this build actually offers; anything else
    // would create an order nobody can pay for.
    if (!priced.method || priced.method.code !== input.method) {
      return { ok: false, error: "unavailable" };
    }
    // The product page stops selling a piece once it is out of stock, but a
    // bag filled before then still held it, and checkout sold it anyway.
    if (priced.cart.lines.some((line) => !line.inStock)) return { ok: false, error: "sold-out" };

    /*
     * The customer agreed to a figure. If pricing here produces a different one
     * — the bag moved on, a price was edited, a coupon lapsed between the quote
     * and the click — the order is refused rather than written at a total
     * nobody was ever shown. Integer paisa on both sides; no float ever touches
     * this comparison (ADR 0003).
     */
    if (
      !Number.isInteger(input.expectedTotalMinor) ||
      input.expectedTotalMinor !== priced.totalMinor
    ) {
      return { ok: false, error: "changed" };
    }

    const methodCode = priced.method.code as MethodCode;
    const coupon = priced.cart.coupon;

    let orderNumber = "";
    for (let attempt = 1; ; attempt++) {
      orderNumber = generateOrderNumber();
      try {
        await createOrder({
          orderNumber,
          customer: { name, phone, email, address },
          lines: priced.cart.lines,
          totals: {
            subtotalMinor: priced.cart.totals.subtotalMinor,
            discountMinor: priced.cart.totals.discountMinor,
            extrasMinor: priced.cart.totals.giftWrapMinor + priced.surchargeMinor,
            totalMinor: priced.totalMinor,
            couponCode: coupon?.ok ? coupon.code : null,
          },
          paymentMethod: methodCode,
          giftWrap: priced.cart.totals.giftWrapMinor > 0,
        });
        break;
      } catch (error) {
        // Nothing was written — the transaction rolled back — so a fresh
        // number is all a collision needs. It used to fail the checkout.
        if (isDuplicateOrderNumber(error) && attempt < ORDER_NUMBER_ATTEMPTS) continue;
        // The code's last use, or this phone's allowance, went between the
        // quote and the click. Re-quoting shows the customer why in words.
        if (isCouponUnavailable(error)) return { ok: false, error: "changed" };
        throw error;
      }
    }

    // Authorises the receipt and the gateway return without exposing the
    // order to anyone who can guess a number.
    const token = orderLookupToken(orderNumber);

    if (methodCode === "cod") {
      // Cash orders are real the moment they are written, so notify now — but
      // after the response. A slow mail server used to hold the customer on
      // "Placing order…" for as long as SMTP took, long enough to press again
      // and place the same order twice. Nothing in it throws.
      after(() => notifyOrderPlaced(orderNumber));
      return { ok: true, kind: "placed", orderNumber, token };
    }

    try {
      return await startGatewayPayment(methodCode, {
        orderNumber,
        token,
        totalMinor: priced.totalMinor,
        name,
        email,
        phone,
      });
    } catch (error) {
      /*
       * The order is written but the gateway could not be reached (Khalti's
       * initiate call failed, a gateway is misconfigured). The customer is told
       * no charge was made, which is true — so the order must not sit in
       * `pending_payment` holding its coupon use and looking like a payment
       * in flight. Failing it gives the use back and says what happened.
       */
      console.error("[checkout] gateway hand-off failed", { orderNumber, error });
      await markOrderFailed(orderNumber, "could not start the gateway payment");
      return { ok: false, error: "failed" };
    }
  } catch (error) {
    // Nothing was committed: the transaction rolled back. The customer gets
    // the failure panel rather than a stack trace.
    console.error("[checkout] order not placed", error);
    return { ok: false, error: "failed" };
  }
}

async function startGatewayPayment(
  method: Exclude<MethodCode, "cod">,
  order: { orderNumber: string; token: string; totalMinor: number; name: string; email: string; phone: string },
): Promise<PlaceOrderResult> {
  const { orderNumber, token } = order;
  const origin = await siteOrigin();
  const back = `order=${encodeURIComponent(orderNumber)}&token=${encodeURIComponent(token)}`;

  if (method === "esewa") {
    const form = await buildEsewaForm({
      orderNumber,
      totalMinor: order.totalMinor,
      successUrl: `${origin}/api/payments/esewa/success?${back}`,
      failureUrl: `${origin}/api/payments/esewa/failure?${back}`,
    });
    return { ok: true, kind: "redirect", orderNumber, token, ...form };
  }

  if (method === "khalti") {
    const session = await initiateKhaltiPayment({
      orderNumber,
      totalMinor: order.totalMinor,
      returnUrl: `${origin}/api/payments/khalti/callback?${back}`,
      websiteUrl: origin,
      customer: { name: order.name, email: order.email, phone: order.phone },
    });
    return { ok: true, kind: "navigate", orderNumber, token, url: session.paymentUrl };
  }

  const form = await buildCardForm({
    referenceNumber: orderNumber,
    totalMinor: order.totalMinor,
    customerName: order.name,
    email: order.email,
    phone: order.phone,
  });
  return { ok: true, kind: "redirect", orderNumber, token, ...form };
}
