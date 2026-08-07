/**
 * Filter state lives entirely in the query string.
 *
 * That is deliberate: a filtered listing is shareable, bookmarkable, survives a
 * refresh and the back button, and needs no client state. Every filter control
 * is therefore a plain link, which also means the page works with JavaScript
 * disabled and every option is keyboard reachable for free.
 */

export const FILTER_KEYS = ["cat", "material", "purity", "collection", "price"] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];

export type FilterState = Record<FilterKey, string[]>;

export type RawParams = Record<string, string | string[] | undefined>;

function readList(params: RawParams, key: string): string[] {
  const raw = params[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
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

/** Build a querystring, dropping empty groups so URLs stay clean. */
function toQuery(state: FilterState, extra: Record<string, string | undefined> = {}): string {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    if (state[key].length) params.set(key, state[key].join(","));
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value) params.set(key, value);
  }
  return params.toString();
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
  const next = current.includes(value)
    ? current.filter((v) => v !== value)
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
