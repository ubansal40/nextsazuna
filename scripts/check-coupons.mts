#!/usr/bin/env node
/**
 * Coupon checks.
 *
 * A coupon is the one thing in this admin that changes what a customer is
 * charged, and the drawer describes it in a sentence before it is saved:
 * "10% off (max रु 2,000) on carts over रु 10,000". If that sentence and the
 * checkout's arithmetic ever disagree, the shop gives a discount nobody
 * authorised — and nothing throws, because both sides are individually valid.
 *
 * So the central assertion is a round trip: for every shape the drawer can
 * author, the figure the summary names is the figure `couponDiscountMinor`
 * computes, in exact paisa.
 *
 * The date checks are here for a subtler reason. The form fields are calendar
 * days, the columns are DATETIME, and Nepal runs at UTC+05:45 — so a coupon
 * dated "expires 31 Aug" stored naively at UTC midnight would actually stop
 * working at 18:15 on the 30th, Nepal time.
 *
 * Run: npx tsx scripts/check-coupons.mts
 */
import {
  CODE_MAX_LENGTH,
  blankDraft,
  countOrNull,
  couponStatus,
  describeCoupon,
  describeValidity,
  discountLabel,
  draftDiscountMinor,
  draftFromRow,
  expiryInstant,
  generateCode,
  startInstant,
  toDayInput,
  validateDraft,
  type CouponDraft,
} from "../lib/admin/coupon-rules";
import { couponDiscountMinor, toMinor } from "../lib/admin/order-money";
import { COUPON_FAILURES, COUPON_MESSAGE } from "../lib/coupon-messages";

const checks: [string, boolean][] = [];
const draft = (over: Partial<CouponDraft> = {}): CouponDraft => ({ ...blankDraft(), ...over });

/* --- the round trip -------------------------------------------------------
 * If any of these fail, the drawer promises a discount the checkout will not
 * give. Each case states the summary AND the paisa it must produce.
 */

const rupees = (n: number) => n * 100;

const cases: { name: string; d: CouponDraft; subtotalMinor: number; expect: number; says: RegExp }[] = [
  {
    name: "a plain 10%",
    d: draft({ code: "SAVE10", discountValue: "10" }),
    subtotalMinor: rupees(20_000),
    expect: rupees(2_000),
    says: /^10% off/,
  },
  {
    name: "a 10% capped at रु 2,000, under the cap",
    d: draft({ code: "SAVE10", discountValue: "10", maxDiscount: "2000" }),
    subtotalMinor: rupees(15_000),
    expect: rupees(1_500),
    says: /max रु 2,000/,
  },
  {
    name: "a 10% capped at रु 2,000, over the cap",
    d: draft({ code: "SAVE10", discountValue: "10", maxDiscount: "2000" }),
    subtotalMinor: rupees(90_000),
    expect: rupees(2_000),
    says: /max रु 2,000/,
  },
  {
    name: "a fixed रु 5,000",
    d: draft({ code: "FLAT5K", discountType: "fixed", discountValue: "5000" }),
    subtotalMinor: rupees(60_000),
    expect: rupees(5_000),
    says: /^रु 5,000 off/,
  },
  {
    name: "a fixed amount larger than the bag never hands money back",
    d: draft({ code: "FLAT5K", discountType: "fixed", discountValue: "5000" }),
    subtotalMinor: rupees(1_200),
    expect: rupees(1_200),
    says: /^रु 5,000 off/,
  },
  {
    name: "a third off, rounded to the paisa",
    d: draft({ code: "THIRD", discountValue: "33.33" }),
    subtotalMinor: rupees(12_345),
    // 1234500 * 33.33 / 100 = 411458.85 -> 411459, rounded once and only once
    expect: 411_459,
    says: /^33.33% off/,
  },
];

for (const c of cases) {
  checks.push([
    `${c.name}: the drawer and the checkout agree on the paisa`,
    draftDiscountMinor(c.d, c.subtotalMinor) === c.expect,
  ]);
  checks.push([`${c.name}: the summary says so`, c.says.test(describeCoupon(c.d))]);
}

// The cap is a percent-only control, so a fixed coupon must ignore a stale one
// left behind by switching type — otherwise a रु 5,000 code silently pays रु 100.
checks.push([
  "a fixed coupon ignores a max-discount left over from percent mode",
  draftDiscountMinor(
    draft({ discountType: "fixed", discountValue: "5000", maxDiscount: "100" }),
    rupees(60_000),
  ) === rupees(5_000),
]);

checks.push([
  "the drawer's arithmetic IS couponDiscountMinor, not a second copy",
  draftDiscountMinor(draft({ discountValue: "12", maxDiscount: "3000" }), rupees(40_000)) ===
    couponDiscountMinor(rupees(40_000), { discountType: "percent", discountValue: 12, maxDiscount: 3000 }),
]);

/* --- the summary sentence ------------------------------------------------- */

checks.push(
  [
    "a draft with no value says so rather than describing nothing",
    describeCoupon(draft()) === "Nothing yet — set a discount value.",
  ],
  [
    "the full sentence reads as one breath",
    describeCoupon(
      draft({
        discountValue: "10",
        maxDiscount: "2000",
        minSubtotal: "10000",
        perCustomerLimit: "2",
        maxUses: "500",
        startsOn: "2026-07-01",
        expiresOn: "2026-08-31",
      }),
    ) === "10% off (max रु 2,000) on carts over रु 10,000 · 2 uses per customer, 500 total · 1 Jul – 31 Aug 2026",
  ],
  [
    "one use per customer is singular",
    describeCoupon(draft({ discountValue: "10", perCustomerLimit: "1" })).includes("1 use per customer"),
  ],
  [
    "a switched-off coupon says so, so it is not mistaken for live",
    describeCoupon(draft({ discountValue: "10", isActive: false })).endsWith("· switched off"),
  ],
);

checks.push(
  ["a validity with both ends prints the shared year once", describeValidity("2026-07-01", "2026-08-31") === "1 Jul – 31 Aug 2026"],
  ["...and both years when they differ", describeValidity("2025-12-20", "2026-01-10") === "20 Dec 2025 – 10 Jan 2026"],
  ["a start alone reads From", describeValidity("2026-09-01", "") === "From 1 Sep 2026"],
  ["an expiry alone reads Until", describeValidity("", "2026-08-31") === "Until 31 Aug 2026"],
  ["no dates at all reads No expiry", describeValidity("", "") === "No expiry"],
);

/* --- the Discount column -------------------------------------------------- */

checks.push(
  ["a percent reads as a percent", discountLabel({ discountType: "percent", discountValue: "10", maxDiscount: "" }) === "10%"],
  ["a capped percent names the cap", discountLabel({ discountType: "percent", discountValue: "10", maxDiscount: "2000" }) === "10% (max रु 2,000)"],
  ["a fixed amount reads as money", discountLabel({ discountType: "fixed", discountValue: "5000", maxDiscount: "" }) === "रु 5,000 off"],
  ["a fixed amount never shows a stale cap", discountLabel({ discountType: "fixed", discountValue: "5000", maxDiscount: "100" }) === "रु 5,000 off"],
);

/* --- opening an existing coupon does not change it ------------------------
 * The drawer edits a draft, not the row. If loading a stored coupon and saving
 * it untouched produced different values, every visit to the screen would
 * quietly rewrite a promotion.
 */

const stored = {
  code: "SAVE10",
  discountType: "percent" as const,
  discountValue: "10.00",
  maxDiscount: "2000.00",
  minSubtotal: "10000.00",
  maxUses: 500,
  perCustomerLimit: 2,
  startsOn: "2026-07-01",
  expiresOn: "2026-08-31",
  isActive: true,
};
const loaded = draftFromRow(stored);

checks.push(
  ["a stored coupon loads into the drawer with no errors", Object.keys(validateDraft(loaded)).length === 0],
  ["...its DECIMAL columns lose the trailing zeroes a form should not show", loaded.discountValue === "10" && loaded.maxDiscount === "2000"],
  ["...and the discount it describes is unchanged", draftDiscountMinor(loaded, rupees(50_000)) === rupees(2_000)],
  [
    "a coupon with no cap, no minimum and no limits loads as blanks, not zeroes",
    (() => {
      const bare = draftFromRow({
        ...stored,
        maxDiscount: null,
        minSubtotal: "0.00",
        maxUses: null,
        perCustomerLimit: null,
        startsOn: "",
        expiresOn: "",
      });
      return (
        bare.maxDiscount === "" &&
        bare.minSubtotal === "" &&
        bare.maxUses === "" &&
        bare.perCustomerLimit === "" &&
        describeCoupon(bare) === "10% off · No expiry"
      );
    })(),
  ],
);

/* --- day boundaries -------------------------------------------------------
 * Nepal is UTC+05:45. A day stored at UTC midnight is nearly six hours wrong,
 * at both ends, in the direction that shortens the promotion.
 */

const iso = (d: Date | null) => (d ? d.toISOString() : "");

checks.push(
  ["a start day begins at 00:00 in Kathmandu", iso(startInstant("2026-09-01")) === "2026-08-31T18:15:00.000Z"],
  ["an expiry day ends at 23:59:59 in Kathmandu", iso(expiryInstant("2026-08-31")) === "2026-08-31T18:14:59.000Z"],
  ["the expiry instant is after the start instant of the same day", (expiryInstant("2026-08-31")?.getTime() ?? 0) > (startInstant("2026-08-31")?.getTime() ?? 0)],
  ["a start day round-trips back to the same day", toDayInput(startInstant("2026-09-01")) === "2026-09-01"],
  ["an expiry day round-trips back to the same day", toDayInput(expiryInstant("2026-08-31")) === "2026-08-31"],
  ["a blank day is blank, not the epoch", startInstant("") === null && expiryInstant("") === null && toDayInput(null) === ""],
  ["an impossible day is refused rather than rolled over", startInstant("2026-02-31") === null],
  ["a non-date string is refused", startInstant("soon") === null],
);

/* --- status --------------------------------------------------------------
 * The pill on the list is what the owner reads to decide whether a promotion
 * is running. It has to mean the same thing the checkout means.
 */

const on = (day: string) => new Date(`${day}T06:00:00.000Z`); // midday in Nepal
const window = (startsOn: string, expiresOn: string, isActive = true) => ({
  isActive,
  startsAt: startInstant(startsOn),
  expiresAt: expiryInstant(expiresOn),
});

checks.push(
  ["a coupon before its start day is Scheduled", couponStatus(window("2026-09-01", "2026-09-30"), on("2026-08-20")) === "scheduled"],
  ["a coupon ON its start day is Active", couponStatus(window("2026-09-01", "2026-09-30"), on("2026-09-01")) === "active"],
  ["a coupon ON its expiry day is still Active", couponStatus(window("2026-09-01", "2026-09-30"), on("2026-09-30")) === "active"],
  ["a coupon the day after expiry is Expired", couponStatus(window("2026-09-01", "2026-09-30"), on("2026-10-01")) === "expired"],
  ["a coupon with no dates is Active", couponStatus(window("", ""), on("2026-09-15")) === "active"],
  ["switching it off beats every date", couponStatus(window("2026-09-01", "2026-09-30", false), on("2026-09-15")) === "inactive"],
  ["...including one that has not started", couponStatus(window("2027-01-01", "", false), on("2026-09-15")) === "inactive"],
);

// The boundary itself: the last second of the expiry day in Nepal is still
// valid, the next second is not.
const lastSecond = expiryInstant("2026-09-30")!;
checks.push(
  ["the final second of the expiry day still works", couponStatus(window("", "2026-09-30"), lastSecond) === "active"],
  ["one second later it does not", couponStatus(window("", "2026-09-30"), new Date(lastSecond.getTime() + 1000)) === "expired"],
);

/* --- validation ----------------------------------------------------------- */

const err = (over: Partial<CouponDraft>, taken: string[] = []) => validateDraft(draft(over), taken);

checks.push(
  ["a blank code is refused", Boolean(err({ discountValue: "10" }).code)],
  ["a two-character code is refused", Boolean(err({ code: "AB", discountValue: "10" }).code)],
  ["a code with a space is refused", Boolean(err({ code: "SAVE 10", discountValue: "10" }).code)],
  ["a code with a symbol is refused", Boolean(err({ code: "SAVE!10", discountValue: "10" }).code)],
  ["dashes are allowed", !err({ code: "EID-2026", discountValue: "10" }).code],
  [
    `a code over ${CODE_MAX_LENGTH} characters is refused before the column truncates it`,
    Boolean(err({ code: "A".repeat(CODE_MAX_LENGTH + 1), discountValue: "10" }).code),
  ],
  [
    "a duplicate code is caught here, not by the unique key",
    /already uses SAVE10/.test(err({ code: "SAVE10", discountValue: "10" }, ["SAVE10"]).code ?? ""),
  ],
  [
    "duplicates are compared case-insensitively, as uniq_code is",
    Boolean(err({ code: "save10", discountValue: "10" }, ["SAVE10"]).code),
  ],
  [
    "a coupon may be saved under its own code",
    !err({ code: "SAVE10", discountValue: "10" }, ["OTHER"]).code,
  ],
  ["a percentage over 100 is refused", Boolean(err({ code: "HALF", discountValue: "101" }).value)],
  ["exactly 100% is allowed", !err({ code: "FREE100", discountValue: "100" }).value],
  ["a zero discount is refused", Boolean(err({ code: "NOOP", discountValue: "0" }).value)],
  ["a blank discount is refused", Boolean(err({ code: "NOOP" }).value)],
  ["a negative discount is refused", Boolean(err({ code: "NOOP", discountValue: "-5" }).value)],
  ["a zero cap is refused — blank is how you say no cap", Boolean(err({ code: "C", discountValue: "10", maxDiscount: "0" }).maxDiscount)],
  ["a blank cap is fine", !err({ code: "C", discountValue: "10", maxDiscount: "" }).maxDiscount],
  ["a zero usage limit is refused", Boolean(err({ code: "L", discountValue: "10", maxUses: "0" }).limits)],
  ["a zero per-customer limit is refused", Boolean(err({ code: "L", discountValue: "10", perCustomerLimit: "0" }).limits)],
  ["blank limits mean unlimited", !err({ code: "L", discountValue: "10" }).limits],
  ["an expiry before the start is refused", Boolean(err({ code: "D", discountValue: "10", startsOn: "2026-09-10", expiresOn: "2026-09-01" }).dates)],
  ["a same-day window is allowed — a one-day sale is a real thing", !err({ code: "D", discountValue: "10", startsOn: "2026-09-10", expiresOn: "2026-09-10" }).dates],
  ["a valid draft has no errors at all", Object.keys(err({ code: "SAVE10", discountValue: "10" })).length === 0],
);

/* --- numbers -------------------------------------------------------------- */

checks.push(
  ["a blank count is null, not zero", countOrNull("") === null],
  ["a count is floored to a whole number", countOrNull("2.9") === 2],
  ["rubbish in a count is null rather than NaN", countOrNull("abc") === null],
  ["a rupee figure converts to exact paisa", toMinor("2000.00") === 200_000],
);

/* --- every refusal has a sentence ----------------------------------------
 * The map was `Record<string, string>` behind a `?? invalid` fallback, so a new
 * reason would have told the customer their code was misspelled.
 */

checks.push([
  "every coupon failure has a customer-facing message",
  COUPON_FAILURES.every((reason) => typeof COUPON_MESSAGE[reason] === "string" && COUPON_MESSAGE[reason].length > 0),
]);
checks.push([
  "no two failures share a message — each has to say something different",
  new Set(COUPON_FAILURES.map((r) => COUPON_MESSAGE[r])).size === COUPON_FAILURES.length,
]);
checks.push([
  "the per-customer refusal exists, so the limit can be explained when it bites",
  COUPON_FAILURES.includes("per-customer"),
]);

/* --- generated codes ------------------------------------------------------ */

// A cycling "random" so the collision loop is actually exercised rather than
// getting lucky: the first eight draws walk the whole word list.
let tick = 0;
const cycle = () => {
  const values = [0, 0.13, 0.26, 0.39, 0.51, 0.64, 0.77, 0.9];
  const v = values[tick % values.length];
  tick += 1;
  return v;
};

const generated = generateCode([], cycle);
checks.push(
  ["a generated code passes the drawer's own code rule", !validateDraft(draft({ code: generated, discountValue: "10" })).code],
  [
    "a generated code never collides with one already taken",
    (() => {
      tick = 0;
      const taken = ["GOLD10", "LUSTRE21", "AURA33"];
      for (let i = 0; i < 25; i += 1) {
        const code = generateCode(taken, cycle);
        if (taken.includes(code)) return false;
      }
      return true;
    })(),
  ],
);

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}
console.log(`\n${checks.length - failed} passed, ${failed} failed`);
if (failed) {
  console.error("\n✗ coupon checks FAILED — the drawer can promise a discount the checkout will not give.");
}
process.exit(failed ? 1 : 0);
