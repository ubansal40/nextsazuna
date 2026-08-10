/**
 * The homepage builder's field schema.
 *
 * Seven block types, roughly forty fields, five nested repeaters. Written once
 * as data and walked by one renderer, rather than seven bespoke forms that
 * would each reimplement the repeater, the image picker and the CTA fieldset.
 *
 * **This describes the STORED shape, not the rendered one.** `lib/homepage-
 * blocks.ts` is a lossy projection: it turns stored `primary_cta` into runtime
 * `cta`, stored `link_text`/`link_href` into `link`, stored `cta_text` into
 * `ctaText`. An editor written against the exported `HomeBlock` types would
 * produce JSON the parser silently discards, so the paths here are the raw
 * config keys and nothing else.
 *
 * Deliberately free of `import "server-only"` — `scripts/check-content.mts`
 * imports it to prove every default here survives the real parser.
 */

/** The block types `lib/homepage-blocks.ts` can actually draw. `newsletter` and
 *  `rich_text` exist in the reference app's data and are deliberately absent:
 *  the parser skips them, so offering them would add invisible sections. */
export const BLOCK_KINDS = [
  "hero",
  "category_grid",
  "usp_strip",
  "product_grid",
  "banner",
  "feature_cards",
  "reviews",
] as const;

export type BlockKind = (typeof BLOCK_KINDS)[number];

/**
 * Icon vocabularies, per block type — they genuinely differ.
 *
 * `sections.tsx` maps them separately: USP_ICON has no `sparkle`, FEATURE_ICON
 * does. The live block already uses `sparkle` inside a usp_strip, where it
 * falls through to the plain lozenge, which is exactly the mistake a shared
 * picker would keep inviting.
 */
export const USP_ICONS = ["diamond", "exchange", "truck", "gift"] as const;
export const FEATURE_ICONS = ["diamond", "sparkle", "exchange", "gift"] as const;

/** Sort keys the listing query accepts. Anything else is coerced to popularity
 *  by the parser, so offering a free-text field here would be a lie. */
export const SORT_OPTIONS = [
  { value: "popularity", label: "Most popular" },
  { value: "newest", label: "Newest first" },
  { value: "bestselling", label: "Best selling" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
] as const;

export type FieldDef =
  | { kind: "text" | "textarea" | "href"; path: string; label: string; help?: string }
  | { kind: "number"; path: string; label: string; min?: number; max?: number; help?: string }
  | { kind: "select"; path: string; label: string; options: readonly { value: string; label: string }[] }
  | { kind: "image"; path: string; label: string; shape: "square" | "wide"; help?: string }
  /** A `{show,text,href}` object — the parser drops the CTA when `show` is
   *  false or `text` is blank, so the three move together. */
  | { kind: "cta"; path: string; label: string }
  | {
      kind: "repeater";
      path: string;
      label: string;
      /** Singular noun for the item cards and the add button: "slide", "tile". */
      itemLabel: string;
      /** Below this the block itself disappears, so removal stops here. */
      min: number;
      /**
       * The field whose absence makes the parser drop the ITEM.
       *
       * This is the silent-drop rule expressed as data: the renderer marks that
       * field required, and `findVanishing` uses it to say which item went and
       * why, instead of the operator discovering a missing section on the shop.
       */
      requiredPath: string;
      fields: FieldDef[];
    };

export interface BlockDef {
  kind: BlockKind;
  /** Shown on the block card and in the picker. */
  label: string;
  /** Picker copy, written for whoever runs the shop — not for a developer. */
  description: string;
  /** A config the parser keeps as-is. Asserted by scripts/check-content.mts. */
  makeDefault: () => Record<string, unknown>;
  /**
   * A config key whose absence makes the parser drop the WHOLE block, where
   * that rule is not carried by a repeater. Only `banner` has one — every other
   * type lives or dies by whether its repeater kept an item.
   */
  requiredPath?: string;
  fields: FieldDef[];
  /** One line under the block's title on the list, e.g. "3 slides". */
  summary: (config: Record<string, unknown>) => string;
}

/** `n` of something, pluralised — "1 slide", "4 slides". */
function count(config: Record<string, unknown>, path: string, noun: string): string {
  const n = Array.isArray(config[path]) ? (config[path] as unknown[]).length : 0;
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

const CTA_DEFAULT = { show: false, text: "", href: "" };

export const BLOCK_DEFS: Record<BlockKind, BlockDef> = {
  hero: {
    kind: "hero",
    label: "Hero carousel",
    description: "The big rotating banner at the top of the page.",
    makeDefault: () => ({
      autoplay_ms: 5200,
      slides: [{ eyebrow: "", headline: "New headline", sub: "", image: "", primary_cta: { ...CTA_DEFAULT } }],
    }),
    summary: (c) => count(c, "slides", "slide"),
    fields: [
      {
        kind: "number",
        path: "autoplay_ms",
        label: "Seconds between slides",
        min: 1000,
        max: 20000,
        help: "In milliseconds. Under 1000 falls back to 5200.",
      },
      {
        kind: "repeater",
        path: "slides",
        label: "Slides",
        itemLabel: "slide",
        min: 1,
        requiredPath: "headline",
        fields: [
          { kind: "image", path: "image", label: "Background image", shape: "wide" },
          { kind: "text", path: "eyebrow", label: "Small label above the headline" },
          { kind: "text", path: "headline", label: "Headline" },
          { kind: "textarea", path: "sub", label: "Supporting line" },
          { kind: "cta", path: "primary_cta", label: "Button" },
        ],
      },
    ],
  },

  category_grid: {
    kind: "category_grid",
    label: "Category grid",
    description: "A row of category tiles — circles, or larger cards with captions.",
    makeDefault: () => ({
      layout: "circle",
      eyebrow: "",
      heading: "Shop by category",
      link_text: "",
      link_href: "",
      tiles: [{ label: "New tile", href: "/jewellery", image: "", caption: "", subtext: "", cta_text: "" }],
    }),
    summary: (c) => `${count(c, "tiles", "tile")} · ${c.layout === "card" ? "cards" : "circles"}`,
    fields: [
      {
        kind: "select",
        path: "layout",
        label: "Tile style",
        options: [
          { value: "circle", label: "Circles" },
          { value: "card", label: "Cards" },
        ],
      },
      { kind: "text", path: "eyebrow", label: "Small label above the heading" },
      { kind: "text", path: "heading", label: "Heading" },
      { kind: "text", path: "link_text", label: "Corner link text", help: "Leave blank for no link." },
      { kind: "href", path: "link_href", label: "Corner link URL" },
      {
        kind: "repeater",
        path: "tiles",
        label: "Tiles",
        itemLabel: "tile",
        min: 1,
        requiredPath: "label",
        fields: [
          { kind: "image", path: "image", label: "Image", shape: "square" },
          { kind: "text", path: "label", label: "Label" },
          { kind: "href", path: "href", label: "Links to" },
          { kind: "text", path: "caption", label: "Caption", help: "Cards only." },
          { kind: "text", path: "subtext", label: "Subtext", help: "Cards only." },
          { kind: "text", path: "cta_text", label: "Button text", help: "Cards only." },
        ],
      },
    ],
  },

  usp_strip: {
    kind: "usp_strip",
    label: "Trust badges",
    description: "A row of icon and label badges — free shipping, certification, and so on.",
    makeDefault: () => ({ items: [{ icon: "diamond", label: "New badge", caption: "", href: "" }] }),
    summary: (c) => count(c, "items", "badge"),
    fields: [
      {
        kind: "repeater",
        path: "items",
        label: "Badges",
        itemLabel: "badge",
        min: 1,
        requiredPath: "label",
        fields: [
          {
            kind: "select",
            path: "icon",
            label: "Icon",
            options: USP_ICONS.map((v) => ({ value: v, label: v })),
          },
          { kind: "text", path: "label", label: "Label" },
          { kind: "text", path: "caption", label: "Caption" },
          { kind: "href", path: "href", label: "Links to", help: "Optional." },
        ],
      },
    ],
  },

  product_grid: {
    kind: "product_grid",
    label: "Product edit",
    description: "A grid of products, with optional tabs to switch between two edits.",
    makeDefault: () => ({
      eyebrow: "",
      link_text: "",
      link_href: "",
      limit: 8,
      tabs: [{ label: "Bestsellers", sort: "popularity", limit: 8 }],
    }),
    summary: (c) =>
      (Array.isArray(c.tabs) ? (c.tabs as Record<string, unknown>[]) : [])
        .map((t) => String(t.label ?? ""))
        .filter(Boolean)
        .join(" / ") || "no tabs",
    fields: [
      { kind: "text", path: "eyebrow", label: "Small label above the heading" },
      { kind: "text", path: "link_text", label: "Corner link text" },
      { kind: "href", path: "link_href", label: "Corner link URL" },
      {
        kind: "repeater",
        path: "tabs",
        label: "Tabs",
        itemLabel: "tab",
        min: 1,
        requiredPath: "label",
        fields: [
          { kind: "text", path: "label", label: "Tab label" },
          { kind: "select", path: "sort", label: "Order by", options: SORT_OPTIONS },
          { kind: "number", path: "limit", label: "How many products", min: 1, max: 24 },
        ],
      },
    ],
  },

  banner: {
    kind: "banner",
    label: "Featured banner",
    description: "A wide image beside a heading, some copy and a button.",
    makeDefault: () => ({
      eyebrow: "",
      heading: "New banner",
      body: "",
      image: "",
      primary_cta: { ...CTA_DEFAULT },
    }),
    requiredPath: "heading",
    summary: (c) => String(c.heading || "").slice(0, 48) || "no heading",
    fields: [
      { kind: "image", path: "image", label: "Image", shape: "wide" },
      { kind: "text", path: "eyebrow", label: "Small label above the heading" },
      { kind: "text", path: "heading", label: "Heading" },
      { kind: "textarea", path: "body", label: "Body copy" },
      { kind: "cta", path: "primary_cta", label: "Button" },
    ],
  },

  feature_cards: {
    kind: "feature_cards",
    label: "Why-us cards",
    description: "Small cards with an icon, a title and a sentence.",
    makeDefault: () => ({
      eyebrow: "",
      heading: "Why Sazuna",
      cards: [{ icon: "diamond", title: "New card", body: "" }],
    }),
    summary: (c) => count(c, "cards", "card"),
    fields: [
      { kind: "text", path: "eyebrow", label: "Small label above the heading" },
      { kind: "text", path: "heading", label: "Heading" },
      {
        kind: "repeater",
        path: "cards",
        label: "Cards",
        itemLabel: "card",
        min: 1,
        requiredPath: "title",
        fields: [
          {
            kind: "select",
            path: "icon",
            label: "Icon",
            options: FEATURE_ICONS.map((v) => ({ value: v, label: v })),
          },
          { kind: "text", path: "title", label: "Title" },
          { kind: "textarea", path: "body", label: "Body" },
        ],
      },
    ],
  },

  reviews: {
    kind: "reviews",
    label: "Testimonials",
    description: "Rotating customer quotes.",
    makeDefault: () => ({
      eyebrow: "",
      heading: "What our customers say",
      items: [{ quote: "New quote", author: "", subtext: "" }],
    }),
    summary: (c) => count(c, "items", "quote"),
    fields: [
      { kind: "text", path: "eyebrow", label: "Small label above the heading" },
      { kind: "text", path: "heading", label: "Heading" },
      {
        kind: "repeater",
        path: "items",
        label: "Quotes",
        itemLabel: "quote",
        min: 1,
        requiredPath: "quote",
        fields: [
          { kind: "textarea", path: "quote", label: "Quote" },
          { kind: "text", path: "author", label: "Who said it" },
          { kind: "text", path: "subtext", label: "Where from", help: 'e.g. "Google review · Kathmandu"' },
        ],
      },
    ],
  },
};

/** One authored block, as it is stored. */
export interface StoredBlock {
  id: string;
  type: string;
  visible: boolean;
  config: Record<string, unknown>;
}

export interface StoredLayout {
  blocks: StoredBlock[];
}

/**
 * Read a `homepage_layout` value into the editor's shape, keeping unknown block
 * types rather than dropping them.
 *
 * The parser skips a type it cannot draw, and that is right for rendering — but
 * an editor that did the same would delete the operator's `newsletter` block
 * the first time they pressed Save on something unrelated.
 */
export function readLayout(value: unknown): StoredLayout {
  const entry = (value ?? {}) as { blocks?: unknown };
  const blocks = Array.isArray(entry.blocks) ? entry.blocks : [];
  return {
    blocks: blocks
      .filter((b): b is Record<string, unknown> => Boolean(b) && typeof b === "object")
      .map((b) => ({
        id: typeof b.id === "string" ? b.id : "",
        type: typeof b.type === "string" ? b.type : "",
        visible: b.visible !== false,
        config: (b.config ?? {}) as Record<string, unknown>,
      }))
      .filter((b) => b.id && b.type),
  };
}

/** A new block of `kind`, with an id nothing else is using. */
export function makeBlock(kind: BlockKind, existing: readonly StoredBlock[]): StoredBlock {
  const taken = new Set(existing.map((b) => b.id));
  let n = 1;
  let id = kind.replace(/_/g, "-");
  while (taken.has(id)) id = `${kind.replace(/_/g, "-")}-${++n}`;
  return { id, type: kind, visible: true, config: BLOCK_DEFS[kind].makeDefault() };
}

export function isKnownKind(type: string): type is BlockKind {
  return (BLOCK_KINDS as readonly string[]).includes(type);
}
