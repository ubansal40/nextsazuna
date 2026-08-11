/**
 * Coupon authoring rules — pure, and deliberately free of `server-only` so
 * `scripts/check-coupons.mts` can exercise them directly.
 *
 * Everything here answers one question: **does the coupon the owner just
 * described behave the way the drawer said it would?** The editor writes a row
 * that `lib/coupons.ts` reads at checkout, and the two only agree because the
 * arithmetic behind the drawer's summary sentence is `couponDiscountMinor` —
 * the same function `applyOrderPromo` uses — rather than a second copy of it.
 *
 * `free_shipping` is absent on purpose. The column exists and one live row sets
 * it, but this shop charges no shipping at all (`priceCart` adds nothing, and
 * /shipping says delivery is included in every product price), and no caller
 * reads the flag. Offering the switch would be a control that saves, reports
 * success, and changes no total anywhere.
 */

import { couponDiscountMinor, toMinor } from "./order-money";
import { formatPrice } from "../format";

export type CouponStatus = "active" | "scheduled" | "expired" | "inactive";
export type DiscountType = "percent" | "fixed";

/** `coupons.code` is VARCHAR(50); the pattern is the reference admin's. */
export const CODE_MAX_LENGTH = 50;
export const CODE_MIN_LENGTH = 3;
export const CODE_PATTERN = /^[A-Z0-9-]+$/;

/**
 * The drawer's working shape. Numeric fields are strings because a half-typed
 * field is a string — parsing on every keystroke would fight the person typing,
 * and "" is the only honest way to say "left blank" for a nullable column.
 */
export interface CouponDraft {
  code: string;
  discountType: DiscountType;
  discountValue: string;
  /** Percent only. Blank means no cap. */
  maxDiscount: string;
  minSubtotal: string;
  maxUses: string;
  perCustomerLimit: string;
  /** `yyyy-mm-dd` as `<input type="date">` produces it, or blank. */
  startsOn: string;
  expiresOn: string;
  isActive: boolean;
}

export function blankDraft(): CouponDraft {
  return {
    code: "",
    discountType: "percent",
    discountValue: "",
    maxDiscount: "",
    minSubtotal: "",
    maxUses: "",
    perCustomerLimit: "",
    startsOn: "",
    expiresOn: "",
    isActive: true,
  };
}

/* --------------------------------------------------------------------------
 * Dates
 *
 * The fields are `<input type="date">` — a calendar day — and the columns are
 * DATETIME. `lib/db.ts` sets `timezone: "Z"`, so a Date written here is stored
 * as the UTC instant it names, and Nepal runs at UTC+05:45.
 *
 * Storing the day at UTC midnight would therefore end a coupon dated "31 Aug"
 * at 18:15 on the 30th, Nepal time — nearly six hours of a promotion gone, on
 * its busiest evening. So a day is converted to the instant it actually means
 * to the shop: the start of that day in Kathmandu, and the last second of it.
 * ------------------------------------------------------------------------ */

/** Kathmandu is UTC+05:45 year-round — Nepal observes no daylight saving. */
const NEPAL_OFFSET_MINUTES = 345;
const MINUTE = 60_000;
const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function dayParts(day: string): { y: number; m: number; d: number } | null {
  const match = DAY_PATTERN.exec(String(day ?? "").trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  // Round-trip through Date to reject 31 February and friends, which the
  // browser's own date picker cannot produce but a pasted value can.
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
  return { y, m, d };
}

/** `yyyy-mm-dd` → the instant that day begins in Nepal. Null when blank. */
export function startInstant(day: string): Date | null {
  const parts = dayParts(day);
  if (!parts) return null;
  return new Date(Date.UTC(parts.y, parts.m - 1, parts.d) - NEPAL_OFFSET_MINUTES * MINUTE);
}

/** `yyyy-mm-dd` → the last second of that day in Nepal, so the expiry day is
 *  itself still valid. Null when blank. */
export function expiryInstant(day: string): Date | null {
  const parts = dayParts(day);
  if (!parts) return null;
  return new Date(
    Date.UTC(parts.y, parts.m - 1, parts.d, 23, 59, 59) - NEPAL_OFFSET_MINUTES * MINUTE,
  );
}

/** An instant → the Nepal calendar day it falls on, for `<input type="date">`. */
export function toDayInput(value: Date | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() + NEPAL_OFFSET_MINUTES * MINUTE);
  return local.toISOString().slice(0, 10);
}

/** "31 Aug 2026". Formatted from the day string, so no timezone is involved. */
export function formatDay(day: string, withYear = true): string {
  const parts = dayParts(day);
  if (!parts) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${parts.d} ${months[parts.m - 1]}${withYear ? ` ${parts.y}` : ""}`;
}

/** "1 Jul – 31 Aug 2026" · "From 1 Sep 2026" · "Until 31 Aug 2026" · "No expiry". */
export function describeValidity(startsOn: string, expiresOn: string): string {
  const start = dayParts(startsOn);
  const end = dayParts(expiresOn);
  if (start && end) {
    // The year is printed once when both sides share it — "1 Jul – 31 Aug 2026".
    return `${formatDay(startsOn, start.y !== end.y)} – ${formatDay(expiresOn)}`;
  }
  if (start) return `From ${formatDay(startsOn)}`;
  if (end) return `Until ${formatDay(expiresOn)}`;
  return "No expiry";
}

/* --------------------------------------------------------------------------
 * Status
 * ------------------------------------------------------------------------ */

export interface CouponWindow {
  isActive: boolean;
  startsAt: Date | null;
  expiresAt: Date | null;
}

/**
 * What the list's pill says.
 *
 * The switch beats the calendar: a coupon turned off is "Inactive" whatever its
 * dates say, because that is the state the owner chose and the one the checkout
 * enforces first (`validateCoupon` filters on `is_active` in the WHERE clause).
 */
export function couponStatus(coupon: CouponWindow, now: Date): CouponStatus {
  if (!coupon.isActive) return "inactive";
  if (coupon.startsAt && coupon.startsAt.getTime() > now.getTime()) return "scheduled";
  if (coupon.expiresAt && coupon.expiresAt.getTime() < now.getTime()) return "expired";
  return "active";
}

export const STATUS_LABEL: Record<CouponStatus, string> = {
  active: "Active",
  scheduled: "Scheduled",
  expired: "Expired",
  inactive: "Inactive",
};

/* --------------------------------------------------------------------------
 * Numbers
 * ------------------------------------------------------------------------ */

/** A typed field → a number, or null when blank. Never NaN. */
export function numberOrNull(value: string): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** A whole count field — usage limits — or null when blank. */
export function countOrNull(value: string): number | null {
  const n = numberOrNull(value);
  if (n === null) return null;
  return Math.max(0, Math.floor(n));
}

/* --------------------------------------------------------------------------
 * Validation
 * ------------------------------------------------------------------------ */

export type DraftErrors = Partial<Record<"code" | "value" | "maxDiscount" | "minSubtotal" | "limits" | "dates", string>>;

/**
 * Everything wrong with a draft, keyed by the field that shows it.
 *
 * `taken` is every OTHER coupon's code — the row being edited passes its own
 * siblings, not the whole table, so re-saving a coupon under its own code is
 * not a duplicate. Compared uppercase because `uniq_code` is a case-insensitive
 * unique key and would reject `save10` against `SAVE10` at the database with a
 * far worse message.
 */
export function validateDraft(draft: CouponDraft, taken: Iterable<string> = []): DraftErrors {
  const errors: DraftErrors = {};
  const code = draft.code.trim().toUpperCase();

  if (!code) {
    errors.code = "Give the coupon a code — customers type this at checkout.";
  } else if (code.length < CODE_MIN_LENGTH || !CODE_PATTERN.test(code)) {
    errors.code = "Use at least 3 characters: letters, numbers or dashes.";
  } else if (code.length > CODE_MAX_LENGTH) {
    errors.code = `Keep the code to ${CODE_MAX_LENGTH} characters or fewer.`;
  } else {
    for (const other of taken) {
      if (String(other).trim().toUpperCase() === code) {
        errors.code = `Another coupon already uses ${code}.`;
        break;
      }
    }
  }

  const value = numberOrNull(draft.discountValue);
  if (value === null || value <= 0) {
    errors.value =
      draft.discountType === "percent"
        ? "Set a percentage above 0 — a coupon that takes nothing off does nothing."
        : "Set an amount above 0 — a coupon that takes nothing off does nothing.";
  } else if (draft.discountType === "percent" && value > 100) {
    errors.value = "A percentage can't be over 100.";
  }

  if (draft.discountType === "percent") {
    const cap = numberOrNull(draft.maxDiscount);
    if (draft.maxDiscount.trim() && (cap === null || cap <= 0)) {
      errors.maxDiscount = "A cap has to be more than nothing. Leave it blank for no cap.";
    }
  }

  const min = numberOrNull(draft.minSubtotal);
  if (draft.minSubtotal.trim() && (min === null || min < 0)) {
    errors.minSubtotal = "A minimum subtotal can't be negative.";
  }

  for (const [field, label] of [
    [draft.maxUses, "total usage limit"],
    [draft.perCustomerLimit, "per-customer limit"],
  ] as const) {
    if (field.trim() && (countOrNull(field) ?? 0) < 1) {
      errors.limits = `Leave the ${label} blank for unlimited, or set it to 1 or more.`;
      break;
    }
  }

  if (draft.startsOn && draft.expiresOn) {
    const start = startInstant(draft.startsOn);
    const end = expiryInstant(draft.expiresOn);
    if (start && end && end.getTime() < start.getTime()) {
      errors.dates = "The expiry date is before the start date.";
    }
  }

  return errors;
}

/* --------------------------------------------------------------------------
 * The plain-words summary
 * ------------------------------------------------------------------------ */

const money = (value: string | number) => formatPrice(value) ?? "रु 0";
const count = (n: number) => n.toLocaleString("en-IN");

/**
 * The sentence at the top of the drawer: what this coupon does, in the words
 * the owner would use to describe it to a customer on the phone.
 *
 * It is not decoration. The stored shape is eight nullable columns whose
 * interactions are not obvious — a percent with a cap and a minimum reads very
 * differently from what people expect — and this is the only place the whole
 * thing is stated in one breath before it goes live.
 */
export function describeCoupon(draft: CouponDraft): string {
  const value = numberOrNull(draft.discountValue);
  if (value === null || value <= 0) {
    return "Nothing yet — set a discount value.";
  }

  const cap = draft.discountType === "percent" ? numberOrNull(draft.maxDiscount) : null;
  let sentence =
    draft.discountType === "percent"
      ? `${value}% off${cap && cap > 0 ? ` (max ${money(cap)})` : ""}`
      : `${money(value)} off`;

  const min = numberOrNull(draft.minSubtotal);
  if (min && min > 0) sentence += ` on carts over ${money(min)}`;

  const limits: string[] = [];
  const perCustomer = countOrNull(draft.perCustomerLimit);
  const total = countOrNull(draft.maxUses);
  if (perCustomer) limits.push(`${count(perCustomer)} ${perCustomer === 1 ? "use" : "uses"} per customer`);
  if (total) limits.push(`${count(total)} total`);
  if (limits.length) sentence += ` · ${limits.join(", ")}`;

  sentence += ` · ${describeValidity(draft.startsOn, draft.expiresOn)}`;
  if (!draft.isActive) sentence += " · switched off";
  return sentence;
}

/** The Discount column: "10% (max रु 2,000)" or "रु 5,000 off". */
export function discountLabel(draft: Pick<CouponDraft, "discountType" | "discountValue" | "maxDiscount">): string {
  const value = numberOrNull(draft.discountValue);
  if (value === null || value <= 0) return "—";
  if (draft.discountType === "fixed") return `${money(value)} off`;
  const cap = numberOrNull(draft.maxDiscount);
  return `${value}%${cap && cap > 0 ? ` (max ${money(cap)})` : ""}`;
}

/**
 * A stored coupon as the drawer edits it.
 *
 * The structural parameter type is deliberate: the real row lives in
 * `lib/admin/coupons.ts`, which is `server-only` and so cannot be reached from
 * the check script that proves this round-trips.
 */
export function draftFromRow(row: {
  code: string;
  discountType: DiscountType;
  discountValue: string;
  maxDiscount: string | null;
  minSubtotal: string;
  maxUses: number | null;
  perCustomerLimit: number | null;
  startsOn: string;
  expiresOn: string;
  isActive: boolean;
}): CouponDraft {
  /** DECIMAL columns arrive as "10.00"; a form field should read "10". */
  const trim = (value: string | null): string => {
    if (value === null) return "";
    const n = Number(value);
    if (!Number.isFinite(n)) return "";
    return n === 0 ? "" : String(n);
  };
  return {
    code: row.code,
    discountType: row.discountType,
    discountValue: trim(row.discountValue),
    maxDiscount: trim(row.maxDiscount),
    minSubtotal: trim(row.minSubtotal),
    maxUses: row.maxUses === null ? "" : String(row.maxUses),
    perCustomerLimit: row.perCustomerLimit === null ? "" : String(row.perCustomerLimit),
    startsOn: row.startsOn,
    expiresOn: row.expiresOn,
    isActive: row.isActive,
  };
}

/** The discount this draft would give on a subtotal, in paisa. The drawer's
 *  worked example, computed by the function checkout actually uses. */
export function draftDiscountMinor(draft: CouponDraft, subtotalMinor: number): number {
  return couponDiscountMinor(subtotalMinor, {
    discountType: draft.discountType,
    discountValue: numberOrNull(draft.discountValue) ?? 0,
    maxDiscount: draft.discountType === "percent" ? numberOrNull(draft.maxDiscount) : null,
  });
}

/** True when this draft would be refused for a cart of this size. */
export function belowMinimum(draft: CouponDraft, subtotalMinor: number): boolean {
  const min = numberOrNull(draft.minSubtotal);
  return min !== null && min > 0 && subtotalMinor < toMinor(min);
}

/* --------------------------------------------------------------------------
 * Code generation
 * ------------------------------------------------------------------------ */

const CODE_WORDS = ["GOLD", "LUSTRE", "AURA", "FESTIVE", "BRIDAL", "RADIANT", "EMBER", "SOLITAIRE"];

/**
 * A code nobody is using yet.
 *
 * `random` is injectable so the check script can prove the collision loop
 * actually skips taken codes rather than getting lucky. The fallback after 40
 * tries is deliberate: with eight words and 89 numbers the space is small, and
 * silently returning a duplicate would surface as a database error at save
 * time instead of a fresh suggestion here.
 */
export function generateCode(taken: Iterable<string>, random: () => number = Math.random): string {
  const used = new Set([...taken].map((code) => String(code).trim().toUpperCase()));
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const word = CODE_WORDS[Math.floor(random() * CODE_WORDS.length) % CODE_WORDS.length];
    const number = 10 + (Math.floor(random() * 90) % 90);
    const code = `${word}${number}`;
    if (!used.has(code)) return code;
  }
  for (let n = 1; n < 1000; n += 1) {
    const code = `SAZUNA${n}`;
    if (!used.has(code)) return code;
  }
  return "SAZUNA";
}
