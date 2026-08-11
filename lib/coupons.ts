import "server-only";

import { query } from "./db";
import { normalisePhone } from "./order-lookup";
import type { CouponFailure } from "./coupon-messages";
import type { RowDataPacket } from "mysql2";

/**
 * Promo codes.
 *
 * Validated against the `coupons` table the admin writes to, so a code created
 * there works here without a deploy.
 *
 * The discount is always computed here from the coupon row and a server-priced
 * subtotal. The client sends a code and nothing else — never an amount.
 */

interface CouponRow extends RowDataPacket {
  code: string;
  discount_type: "percent" | "fixed";
  discount_value: string;
  min_subtotal: string | null;
  max_discount: string | null;
  free_shipping: number;
  starts_at: Date | null;
  expires_at: Date | null;
  max_uses: number | null;
  per_customer_limit: number | null;
  used_count: number;
  is_active: number;
}

export type { CouponFailure };

/**
 * Order states that are not a redemption, for the per-customer count.
 *
 * A payment that failed and an order that was cancelled must not consume
 * somebody's one allowed use — being told "you have already used this" because
 * your eSewa redirect timed out is the kind of thing that loses the sale twice.
 *
 * `pending_payment` deliberately DOES count: it is a reservation, matching how
 * `used_count` is incremented the moment the order is written rather than when
 * the money lands. Soft-deleted orders are excluded by the caller's
 * `deleted_at IS NULL`.
 */
export const NON_REDEMPTION_STATUSES = ["payment_failed", "cancelled"] as const;

export interface CouponSuccess {
  ok: true;
  code: string;
  /** Discount in paisa, already clamped to the subtotal and any max. */
  discountMinor: number;
  freeShipping: boolean;
}

export interface CouponRejected {
  ok: false;
  reason: CouponFailure;
  /** Present for "min-subtotal", so the message can name the threshold. */
  minSubtotalMinor?: number;
}

export type CouponResult = CouponSuccess | CouponRejected;

/** Money columns arrive as strings; convert to exact integer paisa. */
function toMinor(value: string | null): number | null {
  if (value === null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : null;
}

/**
 * How many times this person has already redeemed this code.
 *
 * Matched on the phone rather than `customer_id`, because the customer record
 * is created by the order itself — at the moment this runs, a first-time buyer
 * has no id to match on. `RIGHT(REGEXP_REPLACE(...), 10)` is `normalisePhone`'s
 * rule expressed in SQL: buyers type +977, spaces, dashes and leading zeroes,
 * and the stored value is whatever they typed.
 *
 * Narrowed by `idx_orders_coupon` (migration 0018) so this reads a handful of
 * rows rather than scanning every order ever placed.
 */
async function redemptionsByPhone(code: string, phone: string): Promise<number> {
  const [row] = await query<RowDataPacket & { used: number }>(
    `SELECT COUNT(*) AS used
       FROM orders
      WHERE coupon_code = ?
        AND deleted_at IS NULL
        AND status NOT IN (?, ?)
        AND RIGHT(REGEXP_REPLACE(phone, '[^0-9]', ''), 10) = ?`,
    [code, ...NON_REDEMPTION_STATUSES, phone],
  );
  return Number(row?.used ?? 0);
}

export async function validateCoupon(
  rawCode: string,
  subtotalMinor: number,
  now: Date = new Date(),
  /** Who is trying to use it. Only needed for a per-customer limit — the cart
   *  has no idea who is shopping, and the checkout only knows once the phone
   *  field is filled in. */
  who: { phone?: string | null } = {},
): Promise<CouponResult> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, reason: "invalid" };

  const [row] = await query<CouponRow>(
    "SELECT * FROM coupons WHERE UPPER(code) = ? AND is_active = 1 LIMIT 1",
    [code],
  );
  if (!row) return { ok: false, reason: "invalid" };

  if (row.starts_at && new Date(row.starts_at) > now) {
    return { ok: false, reason: "not-started" };
  }
  if (row.expires_at && new Date(row.expires_at) < now) {
    return { ok: false, reason: "expired" };
  }
  if (row.max_uses !== null && row.used_count >= row.max_uses) {
    return { ok: false, reason: "used-up" };
  }

  /*
   * The per-customer cap, checked before the minimum subtotal: this one cannot
   * be fixed by adding to the bag, so sending someone off to spend more and
   * then refusing them would be the wrong order to say things in.
   *
   * Skipped entirely when no phone is known. That is not a hole — `placeOrder`
   * always has a validated phone and re-prices before writing, so the cap is
   * enforced where the order is actually created. Passing it earlier only means
   * the customer hears about it at the field instead of at the button.
   */
  if (row.per_customer_limit !== null && row.per_customer_limit > 0) {
    const phone = normalisePhone(who.phone);
    if (phone.length === 10 && (await redemptionsByPhone(row.code, phone)) >= row.per_customer_limit) {
      return { ok: false, reason: "per-customer" };
    }
  }

  const minSubtotal = toMinor(row.min_subtotal) ?? 0;
  if (subtotalMinor < minSubtotal) {
    return { ok: false, reason: "min-subtotal", minSubtotalMinor: minSubtotal };
  }

  const value = toMinor(row.discount_value) ?? 0;
  let discountMinor =
    row.discount_type === "percent"
      ? // `discount_value` is a percentage, so its paisa conversion has to be
        // undone before it is used as a rate.
        Math.round((subtotalMinor * (value / 100)) / 100)
      : value;

  const cap = toMinor(row.max_discount);
  if (cap !== null) discountMinor = Math.min(discountMinor, cap);

  // A discount larger than the bag would make the total negative.
  discountMinor = Math.max(0, Math.min(discountMinor, subtotalMinor));

  return {
    ok: true,
    code: row.code,
    discountMinor,
    freeShipping: row.free_shipping === 1,
  };
}
