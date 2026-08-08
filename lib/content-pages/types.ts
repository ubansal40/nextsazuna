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
  | { type: "note"; text: InlineText };

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
