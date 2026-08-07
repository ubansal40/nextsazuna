/**
 * Display formatting.
 *
 * Money arrives from the database as a string (see ADR 0003) and must not be
 * parsed into a float anywhere on the way to the screen — 0.1 + 0.2 problems in
 * an order total are the kind of bug that costs real money and is discovered by
 * a customer rather than a test.
 */

/**
 * Nepali rupee, grouped in the South Asian convention (1,25,000 — not 125,000).
 *
 * `Intl.NumberFormat("en-IN")` gives the lakh/crore grouping the design spec
 * uses in every price sample. The currency symbol is prefixed manually rather
 * than via `style: "currency"`, because the NPR symbol Intl emits varies by
 * runtime ICU build and the spec is specific: "रु 1,25,000".
 */
const NPR = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Format a money value for display.
 *
 * Accepts the string the driver returns. Returns null for absent values so
 * callers render nothing rather than "रु NaN" — a missing price is a data
 * problem to surface, not a zero to display.
 */
export function formatPrice(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return null;
  return `रु ${NPR.format(Math.round(numeric))}`;
}

/** Percentage saved, for a discount badge. Null when there is no genuine markdown. */
export function discountPercent(
  price: string | number | null | undefined,
  salePrice: string | number | null | undefined,
): number | null {
  if (price == null || salePrice == null) return null;
  const was = Number(price);
  const now = Number(salePrice);
  if (!Number.isFinite(was) || !Number.isFinite(now) || was <= 0 || now >= was) return null;
  return Math.round(((was - now) / was) * 100);
}

/** Weights are shown to three decimals throughout the spec ("3.410 g"). */
export function formatWeight(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return `${numeric.toFixed(3)} g`;
}
