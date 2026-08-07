/**
 * Storefront navigation — the single source for header nav, mega-menu and
 * footer links. Hardcoded for now to match the spec; a later phase swaps the
 * export for a `site_identity`-backed read without touching any consumer.
 */

export interface MegaMenuColumn {
  title: string;
  links: { label: string; href: string }[];
}

export interface NavCategory {
  label: string;
  href: string;
  columns?: MegaMenuColumn[];
  /** Merchandising panel on the right of the mega-menu. */
  feature?: { eyebrow: string; title: string; href: string };
}

export const NAV_CATEGORIES: NavCategory[] = [
  {
    label: "Rings",
    href: "/jewellery/rings",
    columns: [
      {
        title: "Popular",
        links: [
          { label: "Solitaire rings", href: "/jewellery/solitaire-rings" },
          { label: "Engagement rings", href: "/jewellery/engagement-rings" },
          { label: "Cocktail rings", href: "/jewellery/cocktail-rings" },
          { label: "Bands", href: "/jewellery/bands" },
        ],
      },
      {
        title: "Shop by price",
        links: [
          { label: "Under रु 50,000", href: "/jewellery/rings?max=50000" },
          { label: "रु 50,000 – 1,00,000", href: "/jewellery/rings?min=50000&max=100000" },
          { label: "Above रु 1,00,000", href: "/jewellery/rings?min=100000" },
        ],
      },
      {
        title: "Purity",
        links: [
          { label: "18KT", href: "/jewellery/rings?purity=18kt" },
          { label: "22KT", href: "/jewellery/rings?purity=22kt" },
        ],
      },
    ],
    feature: { eyebrow: "Featured collection", title: "Bridal sets", href: "/jewellery/bridal-sets" },
  },
  { label: "Earrings", href: "/jewellery/earrings" },
  { label: "Mangalsutra", href: "/jewellery/mangalsutra" },
  { label: "Necklaces", href: "/jewellery/necklaces" },
  { label: "Pendants", href: "/jewellery/pendants" },
  { label: "Nose Pins", href: "/jewellery/nose-pins" },
  { label: "Bangles & Bracelets", href: "/jewellery/bangles-bracelets" },
];

/** Rendered after the divider, in oxblood with the gold diamond marker. */
export const NAV_FEATURED: NavCategory = {
  label: "Bridal Necklace",
  href: "/jewellery/bridal-necklace",
};

export const FOOTER_SECTIONS: MegaMenuColumn[] = [
  {
    title: "Shop",
    links: [
      { label: "Rings", href: "/jewellery/rings" },
      { label: "Earrings", href: "/jewellery/earrings" },
      { label: "Mangalsutra", href: "/jewellery/mangalsutra" },
      { label: "Necklaces", href: "/jewellery/necklaces" },
      { label: "Bridal sets", href: "/jewellery/bridal-sets" },
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
