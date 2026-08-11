"use server";

import { requireSection } from "@/lib/admin/require";
import {
  deleteCoupon,
  getCouponUsage,
  listCoupons,
  resetUsedCount,
  saveCoupon,
  setCouponActive,
  type AdminCouponRow,
  type CouponUsage,
} from "@/lib/admin/coupons";
import type { CouponDraft } from "@/lib/admin/coupon-rules";

/**
 * Coupon actions.
 *
 * Each re-gates on `coupons`, outside the try — `requireSection` redirects by
 * throwing, and catching that would turn a denial into `{ok:false}` and render
 * the screen to somebody who may not have it.
 *
 * Every mutation returns the whole refreshed list rather than a delta. Saving a
 * coupon can change more than the row edited — a code renamed, a status that
 * flipped because the dates moved — and reconciling that on the client is how
 * the two copies drift.
 */

export type CouponsResult =
  | { ok: true; rows: AdminCouponRow[]; nowIso: string }
  | { ok: false; error: string };

export type UsageResult = { ok: true; usage: CouponUsage } | { ok: false; error: string };

function fail(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

async function refresh(): Promise<CouponsResult> {
  return { ok: true, rows: await listCoupons(), nowIso: new Date().toISOString() };
}

export async function loadCouponsAction(): Promise<CouponsResult> {
  await requireSection("coupons");
  try {
    return await refresh();
  } catch (error) {
    return fail(error);
  }
}

export async function saveCouponAction(id: number | null, draft: CouponDraft): Promise<CouponsResult> {
  const admin = await requireSection("coupons");
  try {
    await saveCoupon(admin, id, draft);
    return await refresh();
  } catch (error) {
    return fail(error);
  }
}

export async function deleteCouponAction(id: number): Promise<CouponsResult> {
  const admin = await requireSection("coupons");
  try {
    await deleteCoupon(admin, id);
    return await refresh();
  } catch (error) {
    return fail(error);
  }
}

export async function setCouponActiveAction(id: number, active: boolean): Promise<CouponsResult> {
  const admin = await requireSection("coupons");
  try {
    await setCouponActive(admin, id, active);
    return await refresh();
  } catch (error) {
    return fail(error);
  }
}

/** Correct the gate counter to the number of orders that really carry the code.
 *  Returns the refreshed list, so the drawer's figures come from one read. */
export async function resetUsedCountAction(id: number): Promise<CouponsResult> {
  const admin = await requireSection("coupons");
  try {
    await resetUsedCount(admin, id);
    return await refresh();
  } catch (error) {
    return fail(error);
  }
}

export async function loadCouponUsageAction(id: number): Promise<UsageResult> {
  await requireSection("coupons");
  try {
    const usage = await getCouponUsage(id);
    if (!usage) return { ok: false, error: "That coupon no longer exists." };
    return { ok: true, usage };
  } catch (error) {
    return fail(error);
  }
}
