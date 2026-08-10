"use server";

import { priceCart } from "@/lib/cart";
import { notifyOrderPlaced } from "@/lib/order-notifications";
import { orderLookupToken } from "@/lib/order-tokens";
import { siteOrigin } from "@/lib/site-url";
import { MAX_QUANTITY, type CartEntry } from "@/lib/cart-storage";
import { createOrder, generateOrderNumber } from "@/lib/orders";
import { listCheckoutMethods, type CheckoutMethod, type MethodCode } from "@/lib/payments/config";
import { buildEsewaForm } from "@/lib/payments/esewa";
import { buildCardForm } from "@/lib/payments/cybersource";
import { initiateKhaltiPayment } from "@/lib/payments/khalti";
import { formatPrice } from "@/lib/format";

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

const COUPON_MESSAGE: Record<string, string> = {
  invalid: "That code isn't valid. Check the spelling and try again.",
  expired: "This code has expired.",
  "not-started": "This code isn't active yet.",
  "used-up": "This code has been fully redeemed.",
  "min-subtotal": "Your bag doesn't reach this code's minimum.",
};

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
}) {
  const methods = await listCheckoutMethods();
  const method = methods.find((m) => m.code === input.method) ?? methods[0];

  const cart = await priceCart(input.entries, { code: input.code, giftWrap: input.giftWrap });

  // Surcharge applies to what is actually being charged — after the discount,
  // and including gift wrap, since that is part of the amount taken.
  const chargeable = cart.totals.totalMinor;
  const surchargeMinor = method
    ? Math.round((chargeable * method.surchargePercent) / 100)
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
  options: { code?: string; giftWrap?: boolean; method?: string } = {},
): Promise<CheckoutQuote> {
  const priced = await quote({
    entries: cleanEntries(entries),
    code: typeof options.code === "string" ? options.code.slice(0, 50) : undefined,
    giftWrap: options.giftWrap === true,
    method: typeof options.method === "string" ? options.method : "cod",
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
    })),
    methods: priced.methods,
    couponApplied: coupon?.ok === true,
    couponCode: coupon?.ok ? coupon.code : null,
    couponError: coupon && !coupon.ok ? (COUPON_MESSAGE[coupon.reason] ?? COUPON_MESSAGE.invalid) : null,
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
   */
  | { ok: false; error: "empty" | "invalid" | "unavailable" | "changed" | "failed" };

/** Enough to reach someone about a delivery, not a format police. */
function validPhone(phone: string): boolean {
  return phone.replace(/\D/g, "").length >= 7;
}


export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const name = (input.name ?? "").trim();
  const address = (input.address ?? "").trim();
  const phone = (input.phone ?? "").trim();
  const email = (input.email ?? "").trim();

  if (!name || !address || !validPhone(phone)) return { ok: false, error: "invalid" };

  const entries = cleanEntries(input.entries);
  if (!entries.length) return { ok: false, error: "empty" };

  try {
    const priced = await quote({
      entries,
      code: typeof input.code === "string" ? input.code.slice(0, 50) : undefined,
      giftWrap: input.giftWrap === true,
      method: input.method,
    });

    if (!priced.cart.lines.length) return { ok: false, error: "empty" };
    // The chosen method must be one this build actually offers; anything else
    // would create an order nobody can pay for.
    if (!priced.method || priced.method.code !== input.method) {
      return { ok: false, error: "unavailable" };
    }

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
    const orderNumber = generateOrderNumber();
    const coupon = priced.cart.coupon;

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
    });

    // Authorises the receipt and the gateway return without exposing the
    // order to anyone who can guess a number.
    const token = orderLookupToken(orderNumber);

    if (methodCode === "cod") {
      // Cash orders are real the moment they are written, so notify now.
      await notifyOrderPlaced(orderNumber);
      return { ok: true, kind: "placed", orderNumber, token };
    }

    const origin = await siteOrigin();
    const back = `order=${encodeURIComponent(orderNumber)}&token=${encodeURIComponent(token)}`;

    if (methodCode === "esewa") {
      const form = await buildEsewaForm({
        orderNumber,
        totalMinor: priced.totalMinor,
        successUrl: `${origin}/api/payments/esewa/success?${back}`,
        failureUrl: `${origin}/api/payments/esewa/failure?${back}`,
      });
      return { ok: true, kind: "redirect", orderNumber, token, ...form };
    }

    if (methodCode === "khalti") {
      const session = await initiateKhaltiPayment({
        orderNumber,
        totalMinor: priced.totalMinor,
        returnUrl: `${origin}/api/payments/khalti/callback?${back}`,
        websiteUrl: origin,
        customer: { name, email, phone },
      });
      return { ok: true, kind: "navigate", orderNumber, token, url: session.paymentUrl };
    }

    const form = await buildCardForm({
      referenceNumber: orderNumber,
      totalMinor: priced.totalMinor,
      customerName: name,
      email,
      phone,
    });
    return { ok: true, kind: "redirect", orderNumber, token, ...form };
  } catch {
    // The order either committed or it did not; either way the customer gets
    // the failure panel rather than a stack trace.
    return { ok: false, error: "failed" };
  }
}
