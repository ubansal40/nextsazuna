/**
 * Storefront navigation — the single source for header nav, mega-menu and
 * footer links.
 *
 * The labels and ordering are the spec's (SazunaHeader.dc.html:68-78). The
 * slugs are the catalog's: every storefront URL is `/jewellery/{slug}.html` and
 * `slugFromSegment` rejects anything without the suffix, so a link built
 * without it is a 404, not a redirect.
 */

/**
 * Canonical catalog URL. Every internal catalog link goes through this.
 *
 * Lives here rather than in `lib/catalog` because that module is `server-only`
 * and the header is a Client Component — one builder, reachable from both.
 */
export function jewelleryUrl(slug: string, params?: Record<string, string>): string {
  const path = `/jewellery/${encodeURIComponent(slug)}.html`;
  if (!params) return path;
  const query = new URLSearchParams(params).toString();
  return query ? `${path}?${query}` : path;
}

export interface NavCategory {
  /** As shown in the nav bar. */
  label: string;
  /** Real category slug, without the `.html` suffix. */
  slug: string;
  /**
   * The noun the mega-menu templates its copy on — "Shop Bangles", "All
   * Bangles". Splits from `label` where the nav shows a pair.
   */
  megaName: string;
  /**
   * Whether `{slug}-for-women` / `{slug}-for-men` exist. Only rings and
   * earrings are split that way, and the spec's "for Women" / "for Men" rows
   * would 404 on the rest.
   */
  gendered?: boolean;
}

export const NAV_CATEGORIES: NavCategory[] = [
  { label: "Rings", slug: "diamond-rings", megaName: "Rings", gendered: true },
  { label: "Earrings", slug: "diamond-earrings", megaName: "Earrings", gendered: true },
  { label: "Mangalsutra", slug: "diamond-mangalsutra", megaName: "Mangalsutra" },
  { label: "Necklaces", slug: "diamond-necklace", megaName: "Necklaces" },
  { label: "Pendants", slug: "diamond-pendant", megaName: "Pendants" },
  { label: "Nose Pins", slug: "diamond-nose-pin", megaName: "Nose Pins" },
  { label: "Bangles & Bracelets", slug: "diamond-bangles", megaName: "Bangles" },
];

/** Rendered after the divider, in oxblood with the gold diamond marker. */
export const NAV_FEATURED = {
  label: "Bridal Necklace",
  slug: "diamond-wedding-necklace",
};

/**
 * Mega-menu price bands.
 *
 * Labels are the spec's; `bracket` is the id `lib/catalog/facets.ts` filters
 * on, so the link lands on a real filtered listing rather than an invented
 * min/max query the page ignores.
 */
export const MEGA_PRICE_BANDS = [
  { label: "रु 40k – 75k", bracket: "b1" },
  { label: "रु 75k – 1.5L", bracket: "b2" },
  { label: "रु 1.5L – 5L", bracket: "b3" },
  { label: "रु 5L – 10L", bracket: "b4" },
  { label: "रु 10L +", bracket: "b5" },
];

export const MEGA_PURITIES = ["9KT", "14KT"];

export const MEGA_NOTE = "Every piece is a certified diamond, set in your choice of gold.";

export interface NavSection {
  title: string;
  links: { label: string; href: string }[];
}

export const FOOTER_SECTIONS: NavSection[] = [
  {
    title: "Shop",
    links: [
      { label: "Rings", href: jewelleryUrl("diamond-rings") },
      { label: "Earrings", href: jewelleryUrl("diamond-earrings") },
      { label: "Mangalsutra", href: jewelleryUrl("diamond-mangalsutra") },
      { label: "Necklaces", href: jewelleryUrl("diamond-necklace") },
      { label: "Bridal Necklace", href: jewelleryUrl("diamond-wedding-necklace") },
    ],
  },
  {
    title: "Help",
    links: [
      { label: "Shipping", href: "/shipping" },
      { label: "Returns", href: "/returns" },
      { label: "Payment options", href: "/payment-options" },
      { label: "Certification", href: "/certification" },
      { label: "FAQs", href: "/faqs" },
    ],
  },
  {
    title: "Visit & contact",
    links: [
      { label: "Our stores", href: "/stores" },
      { label: "Craftsmanship", href: "/craftsmanship" },
      { label: "About Sazuna", href: "/about" },
      { label: "The Journal", href: "/blog" },
    ],
  },
];

export const LEGAL_LINKS = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Account deletion", href: "/account-deletion" },
];
