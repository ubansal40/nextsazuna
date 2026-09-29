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
 *
 * The ONE definition: the checkout (`validateCoupon` in lib/coupons.ts), the
 * admin's promo on an order, and the coupon drawer's summary sentence all call
 * this. The checkout used to carry its own copy of the arithmetic, which is how
 * a drawer and a till come to disagree about what a code is worth.
 */
export function couponDiscountMinor(
  subtotalMinor: number,
  coupon: { discountType: "percent" | "fixed"; discountValue: string | number; maxDiscount?: string | number | null },
): number {
  /*
   * Whole rupees, always. Every price in this shop is whole rupees and every
   * figure on screen is rounded to one, so a discount carrying paise is a
   * number nobody can be shown: 10% of रु 12,345 is 1,234.50, which the bag
   * printed as −रु 1,235 above a total of रु 11,111 — rows that do not add up —
   * while eSewa was asked for 11,110.50. The coupon drawer already refuses paise
   * in a fixed amount for the same reason; this is the percentage's half, and
   * the cap is floored so the discount never exceeds the maximum it names.
   */
  let discount =
    coupon.discountType === "percent"
      ? Math.round((subtotalMinor * Number(coupon.discountValue)) / 10_000) * 100
      : Math.round(toMinor(coupon.discountValue) / 100) * 100;
  if (coupon.maxDiscount != null && coupon.maxDiscount !== "") {
    discount = Math.min(discount, Math.floor(toMinor(coupon.maxDiscount) / 100) * 100);
  }
  return Math.max(0, Math.min(discount, subtotalMinor));
}

/**
 * An amount an admin typed → integer paisa. Throws a sentence for anything that
 * is not plainly an amount.
 *
 * `toMinor` is for DECIMAL strings the database hands back, and it is lenient
 * on purpose: an unreadable stored value becomes 0 rather than NaN. That is the
 * wrong rule for a form field. `Number()` reads "1,500" and "रु 1500" as NaN —
 * so a price typed the way it is printed silently became रु 0 — and reads
 * "0x10" as 16, so it became रु 16. Here the only forgiveness is for how
 * people write money in Nepal: grouping commas or spaces (1,50,000), and a
 * leading रु or Rs. Everything else has to be digits with at most two decimals.
 */
export function parseAdminMoney(value: unknown, label = "That amount"): number {
  const typed = String(value ?? "").trim();
  const bare = typed.replace(/^(?:र[ुू]|rs)\.?\s*/i, "").replace(/[,\s]/g, "");
  if (!bare) throw new Error(`${label} is blank — enter an amount, like 1500.`);
  if (!/^\d+(\.\d{1,2})?$/.test(bare)) {
    throw new Error(`${label} isn’t an amount: “${typed}”. Use digits, like 1500 or 1,500.50.`);
  }
  return toMinor(bare);
}

/**
 * Hold an order's discounts inside its goods.
 *
 * `computeTotals` floors the total at zero, but that alone lets a discount
 * bigger than the items eat into the tax and the delivery charge instead — a
 * रु 500 discount on a रु 300 item quietly waives the रु 150 delivery too.
 * Loyalty is settled first because the customer paid for it in points; the
 * discount, which the shop chose to give, takes whatever room is left.
 */
export function clampDiscounts(
  subtotalMinor: number,
  discountMinor: number,
  loyaltyMinor: number,
): { discountMinor: number; loyaltyMinor: number } {
  const goods = Math.max(0, subtotalMinor);
  const loyalty = Math.max(0, Math.min(loyaltyMinor, goods));
  return { discountMinor: Math.max(0, Math.min(discountMinor, goods - loyalty)), loyaltyMinor: loyalty };
}
