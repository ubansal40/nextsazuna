import "server-only";

import { query } from "./db";
import type { RowDataPacket } from "mysql2";

/**
 * Promo codes.
 *
 * Validated against the `coupons` table the Express admin already writes to, so
 * a code created there works here without a migration.
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
  used_count: number;
  is_active: number;
}

export type CouponFailure =
  | "invalid"
  | "expired"
  | "not-started"
  | "used-up"
  | "min-subtotal";

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

export async function validateCoupon(
  rawCode: string,
  subtotalMinor: number,
  now: Date = new Date(),
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
