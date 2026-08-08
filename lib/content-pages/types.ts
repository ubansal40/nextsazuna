import type { IconName } from "@/components/ui";

/**
 * Content page shapes — Sazuna Policy.dc.html and Sazuna Story.dc.html.
 *
 * The two specs render their pages from data rather than markup, so these are a
 * transcription of the block unions they switch over. The copy that fills them
 * comes from the Express storefront's `public/*.html`.
 *
 * Deliberately NOT `server-only`, unlike lib/homepage.ts. That module parses
 * admin-authored JSON out of `content_blocks` at request time, so it needs both
 * the server boundary and a defensive coercion layer. These pages are compiled
 * TypeScript: a malformed block is a type error at build time, not a runtime
 * surprise, and the client-side table of contents and FAQ filter both need to
 * name these types.
 */

/**
 * A run of text with a small inline vocabulary: `**bold**` and `[label](href)`.
 *
 * The alternative was authoring the data as `.tsx` so paragraphs could hold
 * JSX, which drags markup into content files and makes them harder to hand to
 * an admin UI later. See components/content/inline.tsx for the renderer — it
 * builds React elements directly and never touches innerHTML, so the notation
 * cannot smuggle markup in.
 */
export type InlineText = string;

export type PolicyBlock =
  | { type: "p"; text: InlineText }
  | { type: "h3"; text: InlineText }
  | { type: "ul"; items: InlineText[] }
  | { type: "ol"; items: InlineText[] }
  /**
   * The spec's table is two columns because its demo data was; shipping's real
   * table is Region / Cut-off / Arrives. Columns are open-ended and the last one
   * takes the spec's mono treatment, since it always carries the value.
   */
  | { type: "table"; head: InlineText[]; rows: InlineText[][] }
  /** The `.sz-alert--info` panel — a claim the page wants to sit apart. */
  | { type: "callout"; text: InlineText }
  /** Full-width pull quote. Used once, on the buyback promise. */
  | { type: "quote"; text: InlineText }
  /** Small print under a table: tax treatment, how a rate is calculated. */
  | { type: "note"; text: InlineText }
  /**
   * A short run of disclosures inside a prose page — certification closes with
   * a two-question "Quick FAQ". Rendered with the same card accordion as /faqs.
   */
  | { type: "faq"; items: FaqItem[] };

export interface PolicySection {
  /** Anchor id. Load-bearing: the table of contents and deep links use it. */
  id: string;
  heading: string;
  blocks: PolicyBlock[];
}

/** The "Still have questions?" panel every policy page closes with. */
export interface ContentCta {
  heading: string;
  body: string;
  /** Prefilled WhatsApp message. The number comes from `site_identity`. */
  whatsappText: string;
  buttonLabel: string;
}

export interface PolicyPage {
  /** Mono eyebrow above the title — "Policy" or "Legal" in the spec. */
  kicker: string;
  title: string;
  /** Rendered verbatim after "Last updated ·". Already formatted for display. */
  updated: string;
  sections: PolicySection[];
  cta: ContentCta;
}

/** A link out of a story page, as a button or a card action. */
export interface ContentAction {
  label: string;
  href: string;
}

export interface FeatureCard {
  /** An icon from the system set, or a short mono badge like "925" / "SGL". */
  icon?: IconName;
  badge?: string;
  title: string;
  body: InlineText;
  action?: ContentAction;
}

/**
 * Sazuna Story.dc.html's block union, as the real copy needs it.
 *
 * Two of the spec's blocks are absent. `gallery` and the hero image have
 * nowhere to draw from — the Express pages carry no photography at all, and a
 * comment in about.html records that the stock imagery was deliberately deleted
 * rather than left in with invented alt text. `stats` is absent because the
 * spec's row ("20+ years on New Road", "12k+ families served") is demo data
 * that appears nowhere in the source, and those are claims about the business.
 *
 * `links` is the addition: about closes with a row of pointers to
 * craftsmanship, the store and the catalog, which is a lighter thing than the
 * spec's single full-width closing panel.
 */
export type StoryBlock =
  | {
      type: "imageText";
      eyebrow?: string;
      heading: string;
      body: InlineText[];
      /** Mirrors the column order. The spec alternates sides down the page. */
      reverse?: boolean;
    }
  | { type: "statement"; quote: string; attribution?: string }
  | {
      type: "features";
      eyebrow?: string;
      heading?: string;
      cards: FeatureCard[];
    }
  | { type: "links"; cards: { heading: string; body: InlineText; action: ContentAction }[] }
  | { type: "cta"; heading: string; body?: InlineText; action: ContentAction }
  | {
      type: "store";
      name: string;
      /** One line per row. Kept whole rather than split into street/city. */
      address: string[];
      hours: string[];
      phone: string;
      directionsHref: string;
      mapEmbedSrc: string;
      mapTitle: string;
    };

export interface StoryPage {
  hero: { eyebrow: string; title: string; intro: InlineText };
  blocks: StoryBlock[];
}

export interface FaqItem {
  /** Slugified question. Deep links open the matching panel. */
  id: string;
  question: string;
  answer: InlineText;
}

export interface FaqTopic {
  id: string;
  title: string;
  items: FaqItem[];
}

/**
 * The FAQ is the same page furniture as a policy — same header, same table of
 * contents, same closing panel — with topics in place of prose sections.
 */
export interface FaqPage extends Omit<PolicyPage, "sections"> {
  topics: FaqTopic[];
}
