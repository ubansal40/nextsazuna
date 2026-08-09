/**
 * Order money arithmetic — pure, and deliberately free of `server-only` so
 * `scripts/check-order-money.mts` can test it directly.
 *
 * MySQL hands back DECIMAL as a string (`decimalNumbers: false`, ADR 0003)
 * precisely so a price never round-trips through a float. That guarantee only
 * holds if the arithmetic in between also avoids floats, so every calculation
 * here runs on integer paisa and converts back once, at the write.
 *
 * `0.1 + 0.2 !== 0.3` is a curiosity in a blog post and a wrong invoice on a
 * jeweller's order.
 */

/** DECIMAL string -> integer paisa. Rounds exactly once, at the edge. */
export function toMinor(value: string | number | null | undefined): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  // Scale via a string to dodge the classic binary-fraction error: 8.7 * 100 is
  // 869.9999999999999 in IEEE-754, which floors to 869 — a paisa lost per line.
  return Math.round(Number((n * 100).toFixed(4)));
}

/** Integer paisa -> the DECIMAL string the column stores. */
export function toDecimal(minor: number): string {
  return (Math.round(minor) / 100).toFixed(2);
}

export interface OrderTotals {
  subtotalMinor: number;
  discountMinor: number;
  loyaltyMinor: number;
  taxMinor: number;
  shippingMinor: number;
  totalMinor: number;
}

/**
 * The one definition of an order's total.
 *
 * Clamped at zero: a discount larger than the goods must never produce a
 * negative total, which a gateway would reject outright or — worse — read as a
 * refund instruction.
 */
export function computeTotals(parts: Omit<OrderTotals, "totalMinor">): OrderTotals {
  const total =
    parts.subtotalMinor - parts.discountMinor - parts.loyaltyMinor + parts.taxMinor + parts.shippingMinor;
  return { ...parts, totalMinor: Math.max(0, total) };
}

/**
 * A coupon's discount against a subtotal, in paisa.
 *
 * Capped by `maxDiscount` and then by the subtotal itself, so a fixed-value
 * code larger than the order cannot hand money back.
 */
export function couponDiscountMinor(
  subtotalMinor: number,
  coupon: { discountType: "percent" | "fixed"; discountValue: string | number; maxDiscount?: string | number | null },
): number {
  let discount =
    coupon.discountType === "percent"
      ? Math.round((subtotalMinor * Number(coupon.discountValue)) / 100)
      : toMinor(coupon.discountValue);
  if (coupon.maxDiscount != null && coupon.maxDiscount !== "") {
    discount = Math.min(discount, toMinor(coupon.maxDiscount));
  }
  return Math.max(0, Math.min(discount, subtotalMinor));
}
