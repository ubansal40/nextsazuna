"use server";

import { priceCart, type PricedCart } from "@/lib/cart";
import { MAX_QUANTITY, type CartEntry } from "@/lib/cart-storage";

/**
 * Price the bag.
 *
 * A Server Action is a public endpoint, so nothing that arrives is trusted:
 * ids and quantities are re-validated here, unknown products are dropped by
 * the catalog lookup, and every amount is computed from the database. The only
 * thing the caller can influence is *which* products are in the bag.
 */
export async function priceBag(
  entries: unknown,
  options: { code?: string; giftWrap?: boolean } = {},
): Promise<PricedCart> {
  const clean: CartEntry[] = Array.isArray(entries)
    ? entries
        .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
        .map((entry) => ({
          productId: Number(entry.productId),
          quantity: Number(entry.quantity),
        }))
        .filter((entry) => Number.isInteger(entry.productId) && entry.productId > 0)
        .map((entry) => ({
          ...entry,
          quantity: Number.isFinite(entry.quantity)
            ? Math.min(Math.max(Math.floor(entry.quantity), 1), MAX_QUANTITY)
            : 1,
        }))
        // A bag with hundreds of lines is not a shopper, and pricing it is a
        // free database query for whoever sent it.
        .slice(0, 50)
    : [];

  return priceCart(clean, {
    code: typeof options.code === "string" ? options.code.slice(0, 50) : undefined,
    giftWrap: options.giftWrap === true,
  });
}
