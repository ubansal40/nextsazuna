/**
 * The status colour vocabulary — deliberately free of `server-only`.
 *
 * The manage-statuses drawer is a Client Component and needs the list of
 * choices, while the data layer needs to validate what gets stored. Keeping
 * these here means the client can import them without pulling in
 * `lib/admin/order-statuses.ts`, which reaches `next/headers` through the audit
 * log and cannot exist in a browser bundle. (Same split as `pricing.ts` and
 * `product-projection.ts`.)
 *
 * Statuses store a token NAME, never a hex: a colour the database hands a
 * component is still a hardcoded value if it is a literal. `status-badge.tsx`
 * is the single place these become CSS.
 */

export const STATUS_COLOURS = ["gold", "green", "red", "muted", "ink", "info"] as const;

export type StatusColour = (typeof STATUS_COLOURS)[number];

/** Anything unrecognised falls back to `muted` rather than rendering nothing. */
export function normaliseColour(value: unknown): StatusColour {
  const candidate = String(value ?? "").toLowerCase();
  return (STATUS_COLOURS as readonly string[]).includes(candidate) ? (candidate as StatusColour) : "muted";
}
