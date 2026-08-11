import "server-only";

import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { query, transaction } from "../db";
import { recordAdminAction } from "./audit";
import { NON_REDEMPTION_STATUSES } from "../coupons";
import { NON_SPEND_STATUSES } from "./customers";
import {
  CODE_MAX_LENGTH,
  countOrNull,
  expiryInstant,
  normaliseDraft,
  numberOrNull,
  startInstant,
  toDayInput,
  validateDraft,
  type CouponDraft,
} from "./coupon-rules";
import type { AdminContext } from "./rbac";

/**
 * Coupons — the authoring side.
 *
 * The reading side is `lib/coupons.ts`, which the checkout uses. This module
 * never re-implements its rules: whether a code applies is decided there, and
 * what it takes off is `couponDiscountMinor`, shared with the order screen.
 *
 * Two columns are deliberately never written here.
 *
 *   `free_shipping` — the shop charges no shipping (`priceCart` adds nothing,
 *   and the policy page says delivery is included in every product price), and
 *   no code path reads the flag. It is not offered in the editor, so it is not
 *   touched on update: one live row sets it, and an editor must not silently
 *   rewrite a column it declines to show.
 *
 *   `description` — the spec has no field for it. Same reasoning.
 *
 * `used_count` is also never written by a save. It is the counter the checkout
 * gates on, incremented inside `createOrder`'s transaction, and moving it from
 * an edit form would let a typo hand out a sold-out promotion. `resetUsedCount`
 * is the one deliberate exception, and it can only set it to a number derived
 * from real orders.
 *
 * **Dates snap to whole days.** The editor's fields are calendar days, so a
 * legacy row carrying a mid-afternoon `starts_at` is shown — and re-saved — as
 * the start of that day in Nepal. That is the field doing what it says; the
 * alternative is a form that displays one thing and stores another.
 */

export interface AdminCouponRow {
  id: number;
  code: string;
  discountType: "percent" | "fixed";
  /** DECIMAL as a string, all the way to the screen (ADR 0003). */
  discountValue: string;
  maxDiscount: string | null;
  minSubtotal: string;
  maxUses: number | null;
  perCustomerLimit: number | null;
  /** The counter `validateCoupon` gates on. Not the number of real orders. */
  usedCount: number;
  /** Orders that actually carry this code. The truth `usedCount` drifts from. */
  redemptions: number;
  /**
   * Every order carrying the code, cancelled and failed ones included.
   *
   * Deliberately a different number from `redemptions`: a cancelled order is not
   * a redemption, but it is still a row whose `coupon_code` stops resolving the
   * moment the coupon is deleted. This is the figure the delete warning must
   * quote, or it understates the history at risk.
   */
  linkedOrders: number;
  isActive: boolean;
  /** `yyyy-mm-dd` in Nepal, or "" — the shape `<input type="date">` wants. */
  startsOn: string;
  expiresOn: string;
  createdBy: string | null;
}

interface CouponDbRow extends RowDataPacket {
  id: number;
  code: string;
  discount_type: "percent" | "fixed";
  discount_value: string;
  min_subtotal: string;
  max_discount: string | null;
  starts_at: Date | null;
  expires_at: Date | null;
  max_uses: number | null;
  per_customer_limit: number | null;
  used_count: number;
  is_active: number;
  created_by: string | null;
  /** `SUM()` of an integer comes back as DECIMAL, and `decimalNumbers: false`
   *  makes that a string (ADR 0003) — so this is not the number it looks like. */
  redemptions: string | number | null;
  linked_orders: number | null;
}

/** Live orders carrying a code — the rows a delete would orphan. */
const LINKED = `o.coupon_code IS NOT NULL AND o.coupon_code <> '' AND o.deleted_at IS NULL`;

/**
 * Of those, the ones that count as a redemption.
 *
 * The same denylist the per-customer limit enforces with, so the number the
 * owner reads and the number the checkout counts are the same number.
 */
const REDEEMED = `${LINKED} AND o.status NOT IN (${NON_REDEMPTION_STATUSES.map(() => "?").join(", ")})`;

export async function listCoupons(): Promise<AdminCouponRow[]> {
  const rows = await query<CouponDbRow>(
    `SELECT c.*, r.redeemed AS redemptions, r.linked AS linked_orders
       FROM coupons c
       LEFT JOIN (
         SELECT o.coupon_code AS code,
                COUNT(*) AS linked,
                SUM(CASE WHEN o.status NOT IN (${NON_REDEMPTION_STATUSES.map(() => "?").join(", ")}) THEN 1 ELSE 0 END) AS redeemed
           FROM orders o
          WHERE ${LINKED}
          GROUP BY o.coupon_code
       ) r ON r.code = c.code
      ORDER BY c.is_active DESC, c.id DESC`,
    [...NON_REDEMPTION_STATUSES],
  );
  return rows.map(project);
}

function project(row: CouponDbRow): AdminCouponRow {
  return {
    id: row.id,
    code: row.code,
    discountType: row.discount_type,
    discountValue: row.discount_value,
    maxDiscount: row.max_discount,
    minSubtotal: row.min_subtotal,
    maxUses: row.max_uses,
    perCustomerLimit: row.per_customer_limit,
    usedCount: row.used_count,
    redemptions: Number(row.redemptions ?? 0),
    linkedOrders: Number(row.linked_orders ?? 0),
    isActive: row.is_active === 1,
    startsOn: toDayInput(row.starts_at),
    expiresOn: toDayInput(row.expires_at),
    createdBy: row.created_by,
  };
}

/* --------------------------------------------------------------------------
 * Usage
 * ------------------------------------------------------------------------ */

export interface CouponUsage {
  /** Orders carrying this code. */
  redemptions: number;
  /** `coupons.used_count` — what actually blocks a redemption. */
  gateCount: number;
  /** Total taken off, in DECIMAL strings. */
  discountGiven: string;
  /** What those orders were worth, excluding the ones where no money moved. */
  revenue: string;
  /** Distinct phone numbers. */
  customers: number;
  firstAt: string | null;
  lastAt: string | null;
  recent: { id: number; orderNumber: string; total: string; placedAt: string }[];
}

/** `normalisePhone`'s rule in SQL: buyers type +977, spaces, dashes, zeroes. */
const PHONE_KEY = `RIGHT(REGEXP_REPLACE(o.phone, '[^0-9]', ''), 10)`;

export async function getCouponUsage(id: number): Promise<CouponUsage | null> {
  const [coupon] = await query<RowDataPacket & { code: string; used_count: number }>(
    "SELECT code, used_count FROM coupons WHERE id = ? LIMIT 1",
    [id],
  );
  if (!coupon) return null;

  const spendGaps = NON_SPEND_STATUSES.map(() => "?").join(", ");

  const [totals, recent] = await Promise.all([
    query<
      RowDataPacket & {
        n: number;
        discount_given: string | null;
        revenue: string | null;
        customers: number;
        first_at: Date | null;
        last_at: Date | null;
      }
    >(
      `SELECT COUNT(*) AS n,
              COALESCE(SUM(o.discount_amount), 0) AS discount_given,
              COALESCE(SUM(CASE WHEN o.status NOT IN (${spendGaps}) THEN o.total_amount ELSE 0 END), 0) AS revenue,
              COUNT(DISTINCT ${PHONE_KEY}) AS customers,
              MIN(o.created_at) AS first_at,
              MAX(o.created_at) AS last_at
         FROM orders o
        WHERE o.coupon_code = ? AND ${REDEEMED}`,
      [...NON_SPEND_STATUSES, coupon.code, ...NON_REDEMPTION_STATUSES],
    ),
    query<RowDataPacket & { id: number; order_number: string; total_amount: string; created_at: Date }>(
      `SELECT o.id, o.order_number, o.total_amount, o.created_at
         FROM orders o
        WHERE o.coupon_code = ? AND ${REDEEMED}
        ORDER BY o.created_at DESC, o.id DESC
        LIMIT 3`,
      [coupon.code, ...NON_REDEMPTION_STATUSES],
    ),
  ]);

  const row = totals[0];
  return {
    redemptions: Number(row?.n ?? 0),
    gateCount: coupon.used_count,
    discountGiven: row?.discount_given ?? "0.00",
    revenue: row?.revenue ?? "0.00",
    customers: Number(row?.customers ?? 0),
    firstAt: row?.first_at ? new Date(row.first_at).toISOString() : null,
    lastAt: row?.last_at ? new Date(row.last_at).toISOString() : null,
    recent: recent.map((o) => ({
      id: o.id,
      orderNumber: o.order_number,
      total: o.total_amount,
      placedAt: new Date(o.created_at).toISOString(),
    })),
  };
}

/* --------------------------------------------------------------------------
 * Writes
 * ------------------------------------------------------------------------ */

/**
 * mysql2 raises a constraint violation as a plain driver error carrying a
 * `code`. Read structurally: the driver's error class is not exported.
 */
function isDuplicateEntry(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ER_DUP_ENTRY";
}

/** A rupee field → the DECIMAL string the column stores, or null when blank. */
function decimalOrNull(value: string): string | null {
  const n = numberOrNull(value);
  return n === null ? null : n.toFixed(2);
}

export async function saveCoupon(admin: AdminContext, id: number | null, rawInput: unknown): Promise<number> {
  /*
   * A Server Action takes whatever the wire carries, so the shape is coerced
   * before it is judged — otherwise a payload missing `code` is a 500 instead of
   * a refusal.
   *
   * Then the same validator the drawer runs. The client's copy is a courtesy;
   * this one decides — including the range checks, because MySQL does not reject
   * an out-of-range DECIMAL, it silently clamps it, and a save that stores a
   * different number than it was given must never report success.
   *
   * Duplicates are the one exception, left to `uniq_code`: checking first and
   * inserting after is a race, and the unique key cannot lose it.
   */
  const input: CouponDraft = normaliseDraft(rawInput);
  const errors = validateDraft(input, []);
  const first = Object.values(errors)[0];
  if (first) throw new Error(first);

  const code = input.code.trim().toUpperCase().slice(0, CODE_MAX_LENGTH);
  const values = [
    code,
    input.discountType,
    (numberOrNull(input.discountValue) ?? 0).toFixed(2),
    decimalOrNull(input.minSubtotal) ?? "0.00",
    // A cap only means anything for a percentage; carrying one over from a
    // switched type would quietly shrink a fixed discount.
    input.discountType === "percent" ? decimalOrNull(input.maxDiscount) : null,
    startInstant(input.startsOn),
    expiryInstant(input.expiresOn),
    countOrNull(input.maxUses),
    countOrNull(input.perCustomerLimit),
    input.isActive ? 1 : 0,
  ];

  try {
    return await transaction(async (connection) => {
      let couponId = id;
      if (couponId) {
        /*
         * Confirm the row is still there before writing over it. An UPDATE
         * against a deleted id reports `affectedRows: 0` and throws nothing, so
         * without this the drawer says "saved" for a coupon that no longer
         * exists — and `affectedRows` cannot be used to tell the two apart,
         * because a save that changes nothing reports 0 as well.
         */
        const [existing] = await connection.execute<(RowDataPacket & { id: number })[]>(
          "SELECT id FROM coupons WHERE id = ? LIMIT 1",
          [couponId],
        );
        if (!existing[0]) {
          throw new Error("That coupon no longer exists — it may have been deleted by someone else.");
        }
        await connection.execute(
          `UPDATE coupons
              SET code = ?, discount_type = ?, discount_value = ?, min_subtotal = ?, max_discount = ?,
                  starts_at = ?, expires_at = ?, max_uses = ?, per_customer_limit = ?, is_active = ?
            WHERE id = ?`,
          [...values, couponId],
        );
      } else {
        const [result] = await connection.execute<ResultSetHeader>(
          `INSERT INTO coupons (code, discount_type, discount_value, min_subtotal, max_discount,
                                starts_at, expires_at, max_uses, per_customer_limit, is_active, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [...values, admin.email],
        );
        couponId = result.insertId;
      }
      await recordAdminAction(connection, admin, {
        action: id ? "coupons.update" : "coupons.create",
        resourceType: "coupons",
        resourceId: couponId,
        metadata: { code, type: input.discountType, value: input.discountValue, active: input.isActive },
      });
      return couponId;
    });
  } catch (error) {
    if (isDuplicateEntry(error)) throw new Error(`Another coupon already uses ${code}.`);
    throw error;
  }
}

/**
 * Delete a coupon.
 *
 * `orders.coupon_code` is a denormalised string with no foreign key, so this
 * cannot fail on a reference and MySQL will not warn: past orders keep the code
 * printed on them and simply stop resolving to anything. The screen says so
 * before it asks, and offers deactivation instead.
 */
export async function deleteCoupon(admin: AdminContext, id: number): Promise<void> {
  await transaction(async (connection) => {
    const [rows] = await connection.execute<(RowDataPacket & { code: string })[]>(
      "SELECT code FROM coupons WHERE id = ? LIMIT 1",
      [id],
    );
    const code = rows[0]?.code ?? null;
    await connection.execute("DELETE FROM coupons WHERE id = ?", [id]);
    await recordAdminAction(connection, admin, {
      action: "coupons.delete",
      resourceType: "coupons",
      resourceId: id,
      metadata: { code },
    });
  });
}

export async function setCouponActive(admin: AdminContext, id: number, active: boolean): Promise<void> {
  await transaction(async (connection) => {
    await connection.execute("UPDATE coupons SET is_active = ? WHERE id = ?", [active ? 1 : 0, id]);
    await recordAdminAction(connection, admin, {
      action: "coupons.active",
      resourceType: "coupons",
      resourceId: id,
      metadata: { active },
    });
  });
}

/**
 * Set the gate counter to the number of orders that actually carry the code.
 *
 * `used_count` is incremented when an order is written and released nowhere, so
 * it drifts from reality in both directions — an abandoned gateway hop inflates
 * it, and an admin applying a code to an order by hand does not raise it at all.
 * Since it is what `validateCoupon` refuses on, a drifted counter silently kills
 * a live promotion.
 *
 * The new value is computed here from `orders`, not accepted from the caller:
 * this is a correction, not a field an admin can type a number into.
 */
export async function resetUsedCount(admin: AdminContext, id: number): Promise<number> {
  return transaction(async (connection) => {
    const [coupons] = await connection.execute<(RowDataPacket & { code: string; used_count: number })[]>(
      "SELECT code, used_count FROM coupons WHERE id = ? LIMIT 1",
      [id],
    );
    const coupon = coupons[0];
    if (!coupon) throw new Error("That coupon no longer exists.");

    const [counted] = await connection.execute<(RowDataPacket & { n: number })[]>(
      `SELECT COUNT(*) AS n FROM orders o WHERE o.coupon_code = ? AND ${REDEEMED}`,
      [coupon.code, ...NON_REDEMPTION_STATUSES],
    );
    const actual = Number(counted[0]?.n ?? 0);

    await connection.execute("UPDATE coupons SET used_count = ? WHERE id = ?", [actual, id]);
    await recordAdminAction(connection, admin, {
      action: "coupons.reset_uses",
      resourceType: "coupons",
      resourceId: id,
      metadata: { code: coupon.code, from: coupon.used_count, to: actual },
    });
    return actual;
  });
}
