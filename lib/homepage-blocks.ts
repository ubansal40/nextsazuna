/**
 * Homepage composition — the parser, with no database in it.
 *
 * The page is assembled from the `homepage_layout` content block, so the order
 * of the sections, their copy and which of them appear at all are an admin
 * edit rather than a deploy.
 *
 * Deliberately free of `import "server-only"`, and that is the whole point of
 * the split. Two other callers need this logic and neither may touch the pool:
 * `scripts/check-content.mts`, which proves the admin editor emits blocks this
 * parser keeps, and the admin's own draft validation, which runs the REAL
 * parser over an unsaved layout rather than a second copy of these rules. A
 * mirrored copy would drift, and the failure mode of drift here is a section
 * that silently vanishes from the home page.
 *
 * Everything here is defensive. This is admin-authored JSON: a malformed block
 * must degrade to "that section is missing" rather than throw and take down the
 * home page, which is the one page that must never be a stack trace.
 */

export interface HeroSlide {
  eyebrow: string;
  headline: string;
  sub: string;
  image: string | null;
  cta: { text: string; href: string } | null;
}

export interface Tile {
  label: string;
  href: string;
  image: string | null;
  /** Card layout only. */
  caption?: string;
  subtext?: string;
  ctaText?: string;
}

export interface UspItem {
  icon: string;
  label: string;
  caption: string;
  href?: string;
}

export interface FeatureCard {
  icon: string;
  title: string;
  body: string;
}

export interface Review {
  quote: string;
  author: string;
  subtext: string;
}

export interface ProductTab {
  label: string;
  sort: string;
  limit: number;
}

export type HomeBlock =
  | { id: string; type: "hero"; autoplayMs: number; slides: HeroSlide[] }
  | {
      id: string;
      type: "category_grid";
      layout: "circle" | "card";
      eyebrow: string;
      heading: string;
      link: { text: string; href: string } | null;
      tiles: Tile[];
    }
  | { id: string; type: "usp_strip"; items: UspItem[] }
  | {
      id: string;
      type: "product_grid";
      eyebrow: string;
      link: { text: string; href: string } | null;
      tabs: ProductTab[];
    }
  | {
      id: string;
      type: "banner";
      eyebrow: string;
      heading: string;
      body: string;
      image: string | null;
      cta: { text: string; href: string } | null;
    }
  | { id: string; type: "feature_cards"; eyebrow: string; heading: string; cards: FeatureCard[] }
  | { id: string; type: "reviews"; eyebrow: string; heading: string; items: Review[] };

/** Sort keys the listing query accepts; anything else falls back to popularity. */
const SORTS = new Set(["popularity", "price-asc", "price-desc", "newest", "bestselling"]);

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function image(value: unknown): string | null {
  const url = str(value);
  // Absolute URLs (the legacy silveejewels.com photos) and app-relative
  // `/uploads/…` paths (anything the admin pipeline wrote) are both servable.
  // A protocol-relative `//host` is neither — it loads from another origin.
  // Kept in step with `usableImage` in lib/catalog/products.ts.
  if (/^https?:\/\//i.test(url)) return url;
  return /^\/(?!\/)/.test(url) ? url : null;
}

/**
 * Rewrite hrefs authored against the Express app's URL scheme.
 *
 * The block predates this rebuild and points "View all" at `/jewellery.html`,
 * which was a real page there and is not a route here — `/jewellery/{slug}.html`
 * is. Rather than shipping links that 404, the two legacy shapes are mapped to
 * their equivalents. The block itself should be corrected in the admin; this
 * keeps the page working until it is.
 */
function href(value: unknown, fallback = "#"): string {
  const raw = str(value, fallback);
  if (raw.startsWith("/jewellery.html")) return `/jewellery${raw.slice("/jewellery.html".length)}`;
  if (raw === "/products.html") return "/jewellery";
  if (raw.startsWith("/products.html?")) return `/jewellery?${raw.split("?")[1]}`;
  return raw;
}

function cta(value: unknown): { text: string; href: string } | null {
  if (!value || typeof value !== "object") return null;
  const c = value as Record<string, unknown>;
  if (c.show === false) return null;
  const text = str(c.text);
  return text ? { text, href: href(c.href) } : null;
}

function link(text: unknown, target: unknown): { text: string; href: string } | null {
  const label = str(text);
  return label ? { text: label, href: href(target) } : null;
}

function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((v): v is Record<string, unknown> => Boolean(v) && typeof v === "object")
    : [];
}

function toBlock(entry: Record<string, unknown>): HomeBlock | null {
  const id = str(entry.id);
  const type = str(entry.type);
  const config = (entry.config ?? {}) as Record<string, unknown>;
  if (!id || entry.visible === false) return null;

  switch (type) {
    case "hero": {
      const slides = list(config.slides)
        .map((s) => ({
          eyebrow: str(s.eyebrow),
          headline: str(s.headline),
          sub: str(s.sub),
          image: image(s.image),
          cta: cta(s.primary_cta),
        }))
        .filter((s) => s.headline);
      if (!slides.length) return null;
      const ms = Number(config.autoplay_ms);
      return {
        id,
        type: "hero",
        // Below a second the slides are unreadable; 0 or missing means "use the
        // spec's cadence" rather than "advance every frame".
        autoplayMs: Number.isFinite(ms) && ms >= 1000 ? ms : 5200,
        slides,
      };
    }

    case "category_grid": {
      const tiles = list(config.tiles)
        .map((t) => ({
          label: str(t.label),
          href: href(t.href),
          image: image(t.image),
          caption: str(t.caption) || undefined,
          subtext: str(t.subtext) || undefined,
          ctaText: str(t.cta_text) || undefined,
        }))
        .filter((t) => t.label);
      if (!tiles.length) return null;
      return {
        id,
        type: "category_grid",
        layout: str(config.layout) === "card" ? "card" : "circle",
        eyebrow: str(config.eyebrow),
        heading: str(config.heading),
        link: link(config.link_text, config.link_href),
        tiles,
      };
    }

    case "usp_strip": {
      const items = list(config.items)
        .map((i) => ({
          icon: str(i.icon),
          label: str(i.label),
          caption: str(i.caption),
          href: str(i.href) ? href(i.href) : undefined,
        }))
        .filter((i) => i.label);
      return items.length ? { id, type: "usp_strip", items } : null;
    }

    case "product_grid": {
      const fallbackLimit = Number(config.limit);
      const tabs = list(config.tabs)
        .map((t) => {
          const limit = Number(t.limit ?? fallbackLimit);
          const sort = str(t.sort, "popularity");
          return {
            label: str(t.label),
            sort: SORTS.has(sort) ? sort : "popularity",
            limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 24) : 8,
          };
        })
        .filter((t) => t.label);
      if (!tabs.length) return null;
      return {
        id,
        type: "product_grid",
        eyebrow: str(config.eyebrow),
        link: link(config.link_text, config.link_href),
        tabs,
      };
    }

    case "banner": {
      const heading = str(config.heading);
      if (!heading) return null;
      return {
        id,
        type: "banner",
        eyebrow: str(config.eyebrow),
        heading,
        body: str(config.body),
        image: image(config.image),
        cta: cta(config.primary_cta),
      };
    }

    case "feature_cards": {
      const cards = list(config.cards)
        .map((c) => ({ icon: str(c.icon), title: str(c.title), body: str(c.body) }))
        .filter((c) => c.title);
      return cards.length
        ? { id, type: "feature_cards", eyebrow: str(config.eyebrow), heading: str(config.heading), cards }
        : null;
    }

    case "reviews": {
      const items = list(config.items)
        .map((r) => ({ quote: str(r.quote), author: str(r.author), subtext: str(r.subtext) }))
        .filter((r) => r.quote);
      return items.length
        ? { id, type: "reviews", eyebrow: str(config.eyebrow), heading: str(config.heading), items }
        : null;
    }

    default:
      // An unknown type is a section this build does not know how to draw yet.
      // Skipping it is correct: the admin can add blocks ahead of the code.
      return null;
  }
}

/**
 * Parse a whole `homepage_layout` value. Anything that is not a usable block —
 * a missing id, `visible: false`, a type this build cannot draw, a collection
 * whose every entry was rejected — is dropped rather than rendered broken.
 */
export function toBlocks(value: unknown): HomeBlock[] {
  const entry = (value ?? {}) as { blocks?: unknown };
  return list(entry.blocks)
    .map(toBlock)
    .filter((b): b is HomeBlock => b !== null);
}
