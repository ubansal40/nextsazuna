/**
 * Why a promo code was refused, and what the customer is told.
 *
 * Pure, and split out of `lib/coupons.ts` (which is `server-only`) for two
 * reasons. `scripts/check-coupons.mts` can then assert that every failure has a
 * sentence — and, more importantly, typing the map as
 * `Record<CouponFailure, string>` rather than `Record<string, string>` makes
 * adding a reason without adding its message a compile error.
 *
 * Before this split the map was `Record<string, string>` behind a `?? invalid`
 * fallback, so a new refusal reason would have silently told the customer their
 * code was misspelled.
 */

export type CouponFailure =
  | "invalid"
  | "expired"
  | "not-started"
  | "used-up"
  | "per-customer"
  | "min-subtotal";

/** Every member of the union, for exhaustiveness checks. */
export const COUPON_FAILURES = [
  "invalid",
  "expired",
  "not-started",
  "used-up",
  "per-customer",
  "min-subtotal",
] as const satisfies readonly CouponFailure[];

export const COUPON_MESSAGE: Record<CouponFailure, string> = {
  invalid: "That code isn't valid. Check the spelling and try again.",
  expired: "This code has expired.",
  "not-started": "This code isn't active yet.",
  "used-up": "This code has been fully redeemed.",
  // Deliberately not "you have used this before" — a shared phone in a family
  // is common here, and accusing the wrong person is worse than being vague.
  "per-customer": "This code has already been used on this phone number.",
  "min-subtotal": "Your bag doesn't reach this code's minimum.",
};
