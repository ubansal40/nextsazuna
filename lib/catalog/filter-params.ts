/**
 * Filter state lives entirely in the query string.
 *
 * That is deliberate: a filtered listing is shareable, bookmarkable, survives a
 * refresh and the back button, and needs no client state. Every filter control
 * is therefore a plain link, which also means the page works with JavaScript
 * disabled and every option is keyboard reachable for free.
 */

/**
 * Sort options live HERE, not in the toolbar that renders them.
 *
 * They used to be exported from `toolbar.tsx`, which carries `"use client"`.
 * Server Components imported `SORT_VALUES` from it and called `.has()` on it —
 * and that works in TypeScript, builds cleanly, and passes every check, because
 * the type is a real Set. At runtime it is not: Next replaces a client module's
 * exports with client-reference proxies when a server module imports them, so
 * `.has` is undefined and the page 500s.
 *
 * It only fired when a `?sort=` parameter was present, because the call sits
 * behind `sortRaw && …`. Default page loads were fine; using the sort dropdown
 * crashed the listing. This module has no `"use client"` and no `server-only`,
 * so both sides can share it, which is the only safe place for a value both
 * sides read.
 */
export const SORT_OPTIONS = [
  { value: "popularity", label: "Popularity" },
  { value: "price-asc", label: "Price: Low → High" },
  { value: "price-desc", label: "Price: High → Low" },
  { value: "newest", label: "Newest" },
] as const;

export type SortValue = (typeof SORT_OPTIONS)[number]["value"];

export const SORT_VALUES: ReadonlySet<string> = new Set(SORT_OPTIONS.map((o) => o.value));

/** Normalise an untrusted `?sort=` value to one we actually support. */
export function readSort(raw: string | undefined): SortValue {
  return raw && SORT_VALUES.has(raw) ? (raw as SortValue) : "popularity";
}

export const FILTER_KEYS = ["cat", "material", "purity", "collection", "price"] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];

export type FilterState = Record<FilterKey, string[]>;

export type RawParams = Record<string, string | string[] | undefined>;

/**
 * Groups whose values are slugs or bracket ids — [a-z0-9-] by construction, so
 * never containing a comma.
 */
const SLUG_KEYS: ReadonlySet<FilterKey> = new Set(["cat", "collection", "price"]);

/**
 * One value per occurrence of the parameter: `?material=Gold&material=Platinum`.
 *
 * Selections used to be joined into one comma-separated value and split back
 * apart, but material and purity are free text the owner names — "Yellow,
 * White Gold" came back as two values, neither of which exists, and the filter
 * matched nothing. Repeated parameters need no separator at all.
 *
 * Commas are still split for the slug-valued groups, where they cannot be part
 * of a value, so a bookmarked `?cat=rings,earrings` keeps working. A single
 * value in any group — every link the menus build — reads as it always did.
 */
function readList(params: RawParams, key: FilterKey): string[] {
  const raw = params[key];
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const parts = SLUG_KEYS.has(key) ? values.flatMap((value) => value.split(",")) : values;
  return [...new Set(parts.map((s) => s.trim()).filter(Boolean))];
}

export function readFilters(params: RawParams): FilterState {
  return {
    cat: readList(params, "cat"),
    material: readList(params, "material"),
    purity: readList(params, "purity"),
    collection: readList(params, "collection"),
    price: readList(params, "price"),
  };
}

export function activeFilterCount(state: FilterState): number {
  return FILTER_KEYS.reduce((n, key) => n + state[key].length, 0);
}

/**
 * Build a querystring, dropping empty groups so URLs stay clean. Each selected
 * value is its own parameter — see `readList` for why they are not joined.
 */
function toQuery(state: FilterState, extra: Record<string, string | undefined> = {}): string {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    for (const value of state[key]) params.append(key, value);
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value) params.set(key, value);
  }
  return params.toString();
}

/**
 * Whether `value` is among `selected`, compared the way the filter compares.
 *
 * The catalog's columns use a case-insensitive collation, so `?material=gold`
 * filters exactly like `?material=Gold` — and a menu link or an old URL can
 * carry either spelling. Compared exactly, the option for a filter that was
 * plainly applied showed unticked, and ticking it appended a second copy
 * instead of removing the first.
 */
export function isSelected(selected: readonly string[], value: string): boolean {
  const wanted = value.toLowerCase();
  return selected.some((v) => v.toLowerCase() === wanted);
}

/**
 * URL with one option toggled on or off.
 *
 * Changing a filter always returns to the first page — staying on page 4 of a
 * newly filtered set shows an arbitrary slice, or nothing at all.
 */
export function toggleUrl(
  basePath: string,
  state: FilterState,
  key: FilterKey,
  value: string,
  extra: Record<string, string | undefined> = {},
): string {
  const current = state[key];
  const next = isSelected(current, value)
    ? current.filter((v) => !isSelected([v], value))
    : [...current, value];
  const qs = toQuery({ ...state, [key]: next }, extra);
  return qs ? `${basePath}?${qs}` : basePath;
}

/** URL with every filter removed, preserving sort. */
export function clearAllUrl(
  basePath: string,
  extra: Record<string, string | undefined> = {},
): string {
  const qs = toQuery(
    { cat: [], material: [], purity: [], collection: [], price: [] },
    extra,
  );
  return qs ? `${basePath}?${qs}` : basePath;
}

/** URL with sort changed, filters preserved, back to page one. */
export function sortUrl(basePath: string, state: FilterState, sort: string): string {
  const qs = toQuery(state, { sort: sort === "popularity" ? undefined : sort });
  return qs ? `${basePath}?${qs}` : basePath;
}
