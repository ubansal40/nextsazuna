import "server-only";

import { getProductsByIds } from "./catalog";
import { validateCoupon, type CouponResult } from "./coupons";
import { formatPrice } from "./format";
import { MAX_QUANTITY, type CartEntry } from "./cart-storage";

/**
 * Pricing the bag.
 *
 * Every amount here is derived on the server from the catalog and the coupons
 * table. The browser contributes product ids, quantities and a promo code —
 * nothing that could inflate a discount or lower a price.
 *
 * All arithmetic is in integer paisa. Rupee floats accumulate error across
 * several lines, and this total is what a customer is asked to pay.
 */

/**
 * Gift wrap, in paisa. The spec prices it at रु 500 and nothing in the schema
 * models it, so it is a constant here rather than an invented content block —
 * it moves to config the moment there is more than one option.
 */
export const GIFT_WRAP_MINOR = 50_000;

export interface CartLine {
  productId: number;
  name: string;
  href: string;
  sku: string | null;
  imageUrl: string | null;
  quantity: number;
  /** Unit price, formatted. */
  price: string;
  /** Struck original, present only on a genuine markdown. */
  compareAtPrice: string | null;
  priceMinor: number;
  lineTotalMinor: number;
  inStock: boolean;
}

export interface CartTotals {
  subtotalMinor: number;
  discountMinor: number;
  giftWrapMinor: number;
  totalMinor: number;
  subtotal: string;
  discount: string;
  /** What gift wrap adds to this order — zero unless it is switched on. */
  giftWrap: string;
  /** What gift wrap costs, whether or not it is switched on. */
  giftWrapFee: string;
  total: string;
}

export interface PricedCart {
  lines: CartLine[];
  totals: CartTotals;
  /** Item count, counting quantities rather than lines. */
  count: number;
  /** Present when a code was sent; describes whether it took. */
  coupon: (CouponResult & { code: string }) | null;
}

function money(minor: number): string {
  return formatPrice(minor / 100) ?? "";
}

/**
 * Resolve stored entries into priced lines.
 *
 * Ordering follows the entries the browser sent, so the bag does not reshuffle
 * itself between renders.
 */
export async function priceCart(
  entries: CartEntry[],
  options: { code?: string; giftWrap?: boolean } = {},
): Promise<PricedCart> {
  const products = await getProductsByIds(entries.map((entry) => entry.productId));
  const byId = new Map(products.map((product) => [product.id, product]));

  const lines: CartLine[] = [];
  for (const entry of entries) {
    const product = byId.get(entry.productId);
    if (!product) continue;
    const quantity = Math.min(Math.max(Math.floor(entry.quantity), 1), MAX_QUANTITY);
    lines.push({
      productId: product.id,
      name: product.name,
      href: product.href,
      sku: product.sku,
      imageUrl: product.imageUrl,
      quantity,
      price: product.price,
      compareAtPrice: product.compareAtPrice,
      priceMinor: product.priceMinor,
      lineTotalMinor: product.priceMinor * quantity,
      inStock: product.inStock,
    });
  }

  const subtotalMinor = lines.reduce((sum, line) => sum + line.lineTotalMinor, 0);

  // An empty bag cannot carry a discount, and asking the coupons table about
  // one is pointless work.
  const coupon =
    options.code && lines.length
      ? { ...(await validateCoupon(options.code, subtotalMinor)), code: options.code }
      : null;

  const discountMinor = coupon?.ok ? coupon.discountMinor : 0;
  const giftWrapMinor = options.giftWrap && lines.length ? GIFT_WRAP_MINOR : 0;
  const totalMinor = Math.max(0, subtotalMinor - discountMinor) + giftWrapMinor;

  return {
    lines,
    count: lines.reduce((sum, line) => sum + line.quantity, 0),
    coupon,
    totals: {
      subtotalMinor,
      discountMinor,
      giftWrapMinor,
      totalMinor,
      subtotal: money(subtotalMinor),
      discount: money(discountMinor),
      giftWrap: money(giftWrapMinor),
      giftWrapFee: money(GIFT_WRAP_MINOR),
      total: money(totalMinor),
    },
  };
}
