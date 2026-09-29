import "server-only";

import type { PoolConnection } from "mysql2/promise";
import { couponDiscountMinor } from "./admin/order-money";
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

/**
 * How long a gateway order may wait in `pending_payment` and still hold its
 * reservation against a per-customer limit.
 *
 * The reservation is right while the customer is on the gateway's page, and
 * wrong forever after they close it: nothing moves an abandoned attempt out of
 * `pending_payment`, so one eSewa tab closed without paying used to spend that
 * phone's only use of the code for good. Gateway sessions expire well inside an
 * hour (Khalti's payment link lasts 60 minutes), so past that the attempt is
 * abandoned rather than in progress.
 */
export const PAYMENT_WINDOW_MINUTES = 60;

/** The per-customer count, reusable inside a transaction. */
const REDEMPTIONS_BY_PHONE = `SELECT COUNT(*) AS used
     FROM orders
    WHERE coupon_code = ?
      AND deleted_at IS NULL
      AND status NOT IN (${NON_REDEMPTION_STATUSES.map(() => "?").join(", ")})
      AND NOT (status = 'pending_payment'
               AND created_at < NOW() - INTERVAL ${PAYMENT_WINDOW_MINUTES} MINUTE)
      AND RIGHT(REGEXP_REPLACE(phone, '[^0-9]', ''), 10) = ?`;

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
  // Placeholders are counted from the list rather than written out, so adding a
  // status cannot silently shift every parameter after it by one.
  const [row] = await query<RowDataPacket & { used: number }>(REDEMPTIONS_BY_PHONE, [
    code,
    ...NON_REDEMPTION_STATUSES,
    phone,
  ]);
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

  return {
    ok: true,
    code: row.code,
    // The same function the coupon drawer's summary sentence and the admin's
    // promo-on-an-order use: whole rupees, capped, never more than the bag.
    discountMinor: couponDiscountMinor(subtotalMinor, {
      discountType: row.discount_type,
      discountValue: row.discount_value,
      maxDiscount: row.max_discount,
    }),
    freeShipping: row.free_shipping === 1,
  };
}

/** The code can no longer be redeemed by this order. Nothing was written. */
export class CouponUnavailableError extends Error {
  constructor(code: string) {
    super(`Coupon ${code} is no longer available for this order`);
    this.name = "CouponUnavailableError";
  }
}

/**
 * By name rather than `instanceof`: a module loaded twice (two bundler layers,
 * a test harness mixing ESM and CJS) has two copies of the class, and
 * `instanceof` against the wrong one quietly says no.
 */
export function isCouponUnavailable(error: unknown): error is CouponUnavailableError {
  return error instanceof Error && error.name === "CouponUnavailableError";
}

/**
 * Take one use of a code, inside the order's own transaction, BEFORE the order
 * row is written.
 *
 * `validateCoupon` runs on the pool, outside any transaction, and the counter
 * used to be bumped unconditionally afterwards — so two checkouts racing for
 * the 50th use of a "first 50" code both passed and the count read 51, and two
 * tabs on one phone both got a once-per-customer discount. Locking the coupon
 * row serialises every checkout redeeming this code; the count and the limits
 * are then re-read with locking reads, which see what the other checkout
 * committed rather than this transaction's older snapshot.
 *
 * Throws `CouponUnavailableError` when the use is gone; the order is refused and
 * re-quoted, and the customer sees the refusal in words.
 */
export async function reserveCouponUse(
  connection: PoolConnection,
  code: string,
  phone: string,
): Promise<void> {
  const [rows] = await connection.execute<CouponRow[]>(
    "SELECT * FROM coupons WHERE UPPER(code) = ? AND is_active = 1 LIMIT 1 FOR UPDATE",
    [code.trim().toUpperCase()],
  );
  const row = rows[0];
  if (!row) throw new CouponUnavailableError(code);
  if (row.max_uses !== null && row.used_count >= row.max_uses) throw new CouponUnavailableError(code);

  if (row.per_customer_limit !== null && row.per_customer_limit > 0) {
    const key = normalisePhone(phone);
    if (key.length === 10) {
      const [counts] = await connection.execute<(RowDataPacket & { used: number })[]>(
        `${REDEMPTIONS_BY_PHONE} LOCK IN SHARE MODE`,
        [row.code, ...NON_REDEMPTION_STATUSES, key],
      );
      if (Number(counts[0]?.used ?? 0) >= row.per_customer_limit) throw new CouponUnavailableError(code);
    }
  }

  await connection.execute("UPDATE coupons SET used_count = used_count + 1 WHERE id = ?", [row.id]);
}

/**
 * Give back the use an order took, when that order stops being a redemption —
 * its payment failed — so a failed card or an eSewa tab closed mid-payment does
 * not spend a limited code.
 */
export async function releaseCouponUse(connection: PoolConnection, code: string): Promise<void> {
  await connection.execute(
    "UPDATE coupons SET used_count = used_count - 1 WHERE UPPER(code) = ? AND used_count > 0",
    [code.trim().toUpperCase()],
  );
}
