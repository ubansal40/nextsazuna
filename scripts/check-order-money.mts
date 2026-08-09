#!/usr/bin/env node
/**
 * Order money checks.
 *
 * The admin can now edit line prices, quantities, manual discounts and promo
 * codes on a live order, and every one of those recomputes the total. That
 * arithmetic decides what a customer is charged, so it is tested against the
 * failure it is designed to prevent: binary floating point.
 *
 * Run: npx tsx scripts/check-order-money.mts
 */
import { toMinor, toDecimal, computeTotals, couponDiscountMinor } from "../lib/admin/order-money";

const checks: [string, boolean][] = [];

/* --- the float trap -------------------------------------------------------- */

// 8.7 * 100 is 869.9999999999999 in IEEE-754. A naive floor loses a paisa per
// line, and a jeweller's order has many lines.
checks.push(
  ["8.70 scales to 870 paisa, not 869", toMinor("8.70") === 870],
  ["1.10 scales to 110 paisa", toMinor("1.10") === 110],
  ["2.20 scales to 220 paisa", toMinor("2.20") === 220],
  ["4.60 scales to 460 paisa", toMinor("4.60") === 460],
  ["16.08 scales to 1608 paisa", toMinor("16.08") === 1608],
  ["0.1 + 0.2 in paisa is exactly 0.30", toDecimal(toMinor("0.1") + toMinor("0.2")) === "0.30"],
  ["a large price keeps every paisa", toMinor("1234567.89") === 123456789],
);

/* --- string/number boundary ------------------------------------------------ */

checks.push(
  ["a DECIMAL string parses", toMinor("1500.00") === 150000],
  ["a number parses the same as its string", toMinor(1500) === toMinor("1500.00")],
  ["null is zero, not NaN", toMinor(null) === 0],
  ["undefined is zero", toMinor(undefined) === 0],
  ["a non-numeric string is zero, never NaN", toMinor("abc") === 0],
  ["an empty string is zero", toMinor("") === 0],
  ["Infinity is refused", toMinor(Infinity) === 0],
  ["round-trip: paisa -> decimal -> paisa", toMinor(toDecimal(123456)) === 123456],
  ["toDecimal always has two places", toDecimal(100) === "1.00" && toDecimal(5) === "0.05"],
);

/* --- totals ---------------------------------------------------------------- */

const plain = computeTotals({
  subtotalMinor: toMinor("10000.00"),
  discountMinor: toMinor("500.00"),
  loyaltyMinor: 0,
  taxMinor: 0,
  shippingMinor: toMinor("150.00"),
});
checks.push([
  "subtotal - discount + shipping",
  toDecimal(plain.totalMinor) === "9650.00",
]);

const withEverything = computeTotals({
  subtotalMinor: toMinor("2500.55"),
  discountMinor: toMinor("100.10"),
  loyaltyMinor: toMinor("50.20"),
  taxMinor: toMinor("13.00"),
  shippingMinor: toMinor("200.75"),
});
checks.push([
  "every component, to the paisa",
  toDecimal(withEverything.totalMinor) === "2564.00",
]);

// A discount larger than the goods must floor at zero: a negative total is
// either rejected by the gateway or read as a refund.
const overDiscounted = computeTotals({
  subtotalMinor: toMinor("1000.00"),
  discountMinor: toMinor("5000.00"),
  loyaltyMinor: 0,
  taxMinor: 0,
  shippingMinor: 0,
});
checks.push([
  "a discount bigger than the order floors at zero, never negative",
  overDiscounted.totalMinor === 0,
]);

checks.push([
  "loyalty and discount both subtract",
  computeTotals({ subtotalMinor: 100000, discountMinor: 10000, loyaltyMinor: 20000, taxMinor: 0, shippingMinor: 0 })
    .totalMinor === 70000,
]);

/* --- coupons --------------------------------------------------------------- */

checks.push(
  [
    "10% of 2,000 is 200",
    couponDiscountMinor(toMinor("2000.00"), { discountType: "percent", discountValue: 10 }) === toMinor("200.00"),
  ],
  [
    "a percent cap is honoured",
    couponDiscountMinor(toMinor("100000.00"), { discountType: "percent", discountValue: 20, maxDiscount: "1000.00" }) ===
      toMinor("1000.00"),
  ],
  [
    "a fixed coupon is its face value",
    couponDiscountMinor(toMinor("5000.00"), { discountType: "fixed", discountValue: "750.00" }) === toMinor("750.00"),
  ],
  [
    "a fixed coupon larger than the order cannot hand money back",
    couponDiscountMinor(toMinor("500.00"), { discountType: "fixed", discountValue: "5000.00" }) === toMinor("500.00"),
  ],
  [
    "a null cap is not treated as zero",
    couponDiscountMinor(toMinor("2000.00"), { discountType: "percent", discountValue: 10, maxDiscount: null }) ===
      toMinor("200.00"),
  ],
  [
    "an empty-string cap is not treated as zero",
    couponDiscountMinor(toMinor("2000.00"), { discountType: "percent", discountValue: 10, maxDiscount: "" }) ===
      toMinor("200.00"),
  ],
  [
    "a negative discount value cannot increase the total",
    couponDiscountMinor(toMinor("2000.00"), { discountType: "fixed", discountValue: "-500.00" }) === 0,
  ],
  [
    "33.33% of 1,000 rounds to a whole paisa",
    Number.isInteger(couponDiscountMinor(toMinor("1000.00"), { discountType: "percent", discountValue: 33.33 })),
  ],
);

/* --- a realistic order ----------------------------------------------------- */

// Three lines at awkward prices, a promo, and shipping — the shape that breaks
// naive float arithmetic.
const lines = [
  { unit: "8.70", qty: 3 },
  { unit: "16.08", qty: 1 },
  { unit: "0.07", qty: 7 },
];
const subtotal = lines.reduce((sum, l) => sum + toMinor(l.unit) * l.qty, 0);
const promo = couponDiscountMinor(subtotal, { discountType: "percent", discountValue: 10 });
const order = computeTotals({
  subtotalMinor: subtotal,
  discountMinor: promo,
  loyaltyMinor: 0,
  taxMinor: 0,
  shippingMinor: toMinor("150.00"),
});
checks.push(
  ["a three-line subtotal is exact", toDecimal(subtotal) === "42.67"],
  ["its 10% promo is exact", toDecimal(promo) === "4.27"],
  ["its total is exact", toDecimal(order.totalMinor) === "188.40"],
);

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}
console.log(`\n${checks.length - failed} passed, ${failed} failed`);
if (failed) {
  console.error("\n✗ order money checks FAILED — this arithmetic decides what a customer is charged.");
}
process.exit(failed ? 1 : 0);
