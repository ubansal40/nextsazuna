import type { StoryPage } from "../types";

/**
 * Visit us — ported from the Express storefront's public/stores.html.
 *
 * One location. The address, hours and phone are the first thing on the page
 * because that is the page's whole job; the source made the same call, and its
 * comment records that a full-bleed hero and a six-tile gallery were removed
 * rather than restyled, because every one was hot-linked stock photography whose
 * alt text asserted it showed the Sazuna atelier — a factual claim made
 * specifically to people who cannot see the image, on the page they would act
 * on. Nothing here restores that claim.
 *
 * The address is duplicated from `site_identity`, which the footer reads live.
 * That is deliberate: this page prerenders, and the production build has no
 * database. If the shop moves, both need changing.
 */
export const stores = {
  hero: {
    eyebrow: "Visit us",
    title: "Sazuna Jewellers, Kathmandu",
    intro:
      "Numbers on a certificate are one thing; a diamond in your hand is another. Come and see the collection in the light — no appointment needed.",
  },
  blocks: [
    {
      type: "store",
      name: "Sazuna Jewellers — New Road",
      address: ["New Road, Kathmandu 44600, Nepal"],
      hours: ["Mon–Sat · 10 AM – 8 PM", "Closed Sundays"],
      phone: "+977 9801082897",
      directionsHref:
        "https://www.google.com/maps/search/?api=1&query=Sazuna+Jewels+New+Road+Kathmandu",
      mapEmbedSrc: "https://www.google.com/maps?q=Sazuna+Jewels+New+Road+Kathmandu&output=embed",
      mapTitle: "Map showing Sazuna Jewellers, New Road, Kathmandu",
    },
    {
      type: "features",
      eyebrow: "What to expect",
      heading: "Take your time. No pressure.",
      cards: [
        {
          icon: "storefront",
          title: "Free try-on",
          body: "No appointment needed. Pull up a chair and try anything from our case.",
        },
        {
          icon: "shield-check",
          title: "Certificate with every diamond",
          body: "Your SGL certificate is handed to you on the spot for diamond purchases.",
        },
        {
          icon: "refresh",
          title: "Exchange & buyback in person",
          body: "Bring in any Sazuna piece with its card and we'll handle it across the counter.",
        },
        {
          icon: "gift",
          title: "A warm cup of tea",
          body: "While you decide. We never close a sale faster than the chai.",
        },
      ],
    },
    {
      type: "cta",
      heading: "Can't make it to New Road?",
      body: "Everything in the case is online, and ships free and insured across Nepal.",
      action: { label: "Shop the collection", href: "/jewellery" },
    },
  ],
} satisfies StoryPage;
