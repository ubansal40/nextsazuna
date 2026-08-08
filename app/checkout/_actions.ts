"use server";

import { headers } from "next/headers";
import { priceCart } from "@/lib/cart";
import { MAX_QUANTITY, type CartEntry } from "@/lib/cart-storage";
import { createOrder, generateOrderNumber } from "@/lib/orders";
import { listCheckoutMethods, type CheckoutMethod, type MethodCode } from "@/lib/payments/config";
import { buildEsewaForm } from "@/lib/payments/esewa";
import { buildCardForm } from "@/lib/payments/cybersource";
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
  code?: string;
  giftWrap?: boolean;
  method: string;
  name: string;
  phone: string;
  email?: string;
  address: string;
}

export type PlaceOrderResult =
  | { ok: true; kind: "placed"; orderNumber: string }
  | { ok: true; kind: "redirect"; orderNumber: string; action: string; fields: Record<string, string> }
  | { ok: false; error: "empty" | "invalid" | "unavailable" | "failed" };

/** Enough to reach someone about a delivery, not a format police. */
function validPhone(phone: string): boolean {
  return phone.replace(/\D/g, "").length >= 7;
}

/**
 * The absolute origin a gateway should send the customer back to.
 *
 * `SAZUNA_SITE_URL` wins, because behind Cloudflare and LiteSpeed the host we
 * see is not always the one the customer typed. Falling back to the request's
 * own headers matters more than it looks: without it an unset variable sends
 * the return URLs to localhost, and a customer who has paid is redirected
 * nowhere while the order stays unsettled.
 */
async function siteOrigin(): Promise<string> {
  const configured = process.env.SAZUNA_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host");
  const protocol = incoming.get("x-forwarded-proto") ?? "https";
  return host ? `${protocol}://${host}` : "http://localhost:3200";
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

    if (methodCode === "cod") {
      return { ok: true, kind: "placed", orderNumber };
    }

    const origin = await siteOrigin();

    if (methodCode === "esewa") {
      const form = await buildEsewaForm({
        transactionUuid: orderNumber,
        totalMinor: priced.totalMinor,
        successUrl: `${origin}/api/payments/esewa/success`,
        failureUrl: `${origin}/api/payments/esewa/failure?order=${encodeURIComponent(orderNumber)}`,
      });
      return { ok: true, kind: "redirect", orderNumber, ...form };
    }

    const form = await buildCardForm({
      referenceNumber: orderNumber,
      totalMinor: priced.totalMinor,
      customerName: name,
      email,
      phone,
    });
    return { ok: true, kind: "redirect", orderNumber, ...form };
  } catch {
    // The order either committed or it did not; either way the customer gets
    // the failure panel rather than a stack trace.
    return { ok: false, error: "failed" };
  }
}
