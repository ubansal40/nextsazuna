/**
 * The content routes stage 2 added, in one place.
 *
 * The sitemap, the footer and the legacy redirects all need this list, and
 * three copies of it would drift. `indexable` is the same decision the page's
 * own `robots` metadata makes — the two must agree, because a sitemap entry for
 * a noindexed URL is exactly the contradiction the Express app shipped, and
 * Search Console reports it.
 */

export interface ContentRoute {
  path: string;
  /** Listed in the sitemap. False for pages whose metadata sets noindex. */
  indexable: boolean;
  changeFrequency: "monthly" | "yearly";
  priority: number;
  /** The `.html` URL the Express storefront served this at, if any. */
  legacy?: string;
}

export const CONTENT_ROUTES: ContentRoute[] = [
  { path: "/about", indexable: true, changeFrequency: "monthly", priority: 0.6, legacy: "/about.html" },
  { path: "/stores", indexable: true, changeFrequency: "monthly", priority: 0.7, legacy: "/stores.html" },
  { path: "/craftsmanship", indexable: true, changeFrequency: "monthly", priority: 0.5, legacy: "/craftsmanship.html" },
  { path: "/certification", indexable: true, changeFrequency: "monthly", priority: 0.5, legacy: "/certification.html" },
  { path: "/faqs", indexable: true, changeFrequency: "monthly", priority: 0.6, legacy: "/faqs.html" },
  { path: "/shipping", indexable: true, changeFrequency: "monthly", priority: 0.5, legacy: "/shipping.html" },
  { path: "/exchange-resale", indexable: true, changeFrequency: "monthly", priority: 0.5, legacy: "/returns.html" },
  { path: "/payment-options", indexable: true, changeFrequency: "monthly", priority: 0.5, legacy: "/payment-options.html" },
  { path: "/order-status", indexable: true, changeFrequency: "monthly", priority: 0.5 },

  /**
   * Noindexed, carried over from the Express storefront, and therefore absent
   * from the sitemap. The old app listed privacy and terms while serving them
   * noindex; keeping the flag here is what stops that happening again.
   */
  { path: "/privacy", indexable: false, changeFrequency: "yearly", priority: 0.3, legacy: "/privacy.html" },
  { path: "/terms", indexable: false, changeFrequency: "yearly", priority: 0.3, legacy: "/terms.html" },
  { path: "/account-deletion", indexable: false, changeFrequency: "yearly", priority: 0.3, legacy: "/account-deletion.html" },
];
