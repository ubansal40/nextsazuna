import type { StoryPage } from "../types";

/**
 * About — ported from the Express storefront's public/about.html.
 *
 * The source page had already dropped its store band and its five-step process
 * band, with a comment explaining why: both restated /stores.html and
 * /craftsmanship.html, and two URLs asserting the same name, address and phone
 * split a local-search signal. Those stay dropped; the `links` block is the
 * pointer the old page put in their place.
 *
 * No stats row. The spec draws one, but its figures — "20+ years on New Road",
 * "12k+ families served" — are demo data, and claims about the business are not
 * ours to invent.
 */
export const about = {
  hero: {
    eyebrow: "About Sazuna",
    title: "Heirloom pieces, handcrafted in Kathmandu.",
    intro:
      "SGL certified diamonds at honest prices, and 92.5 sterling silver backed by a guarantee we put in writing.",
  },
  blocks: [
    {
      type: "imageText",
      eyebrow: "The story",
      heading: "A small workshop. A simple promise.",
      body: [
        "Sazuna started in a small workshop in Kathmandu, where every piece passed through the same set of hands — from raw silver to finished jewellery. We never wanted to add layers between the bench and the buyer. So we didn't.",
        "Today, we work directly with the workshops that make our pieces — no agents, no distributors, no middlemen. It's why our diamonds are **SGL certified at honest prices**, and why our silver carries the **in-house guarantee** our team puts in writing.",
        "We're not the biggest jewellery brand in Nepal. We don't want to be. We want to be the brand you trust enough to recommend to your sister.",
      ],
    },
    {
      type: "features",
      eyebrow: "Our promise",
      heading: "Four things we put in writing.",
      cards: [
        {
          icon: "shield-check",
          title: "SGL certified diamonds",
          body: "Every diamond ships with an independent SGL certificate. Verifiable online. Always.",
        },
        {
          icon: "refresh",
          title: "Honest buyback",
          body: "Exchange any diamond piece any time. In writing. No expiry.",
        },
        {
          icon: "wrench",
          title: "Handmade in our atelier",
          body: "No factory line. Each piece is shaped, set and finished by hand at our Kathmandu workshop.",
        },
        {
          icon: "gem",
          title: "Made in Nepal",
          body: "Designed, crafted and finished in Kathmandu. Supporting Nepali artisans for every piece we ship.",
        },
      ],
    },
    {
      type: "features",
      eyebrow: "Our commitment to honesty",
      heading: "We promise only what's ours to certify.",
      cards: [
        {
          badge: "925",
          title: "Silver",
          body: "92.5 sterling, backed by our in-house guarantee. No formal hallmark — we don't believe in promising what isn't ours to certify. But every piece is guaranteed in writing.",
          action: { label: "Read the guarantee", href: "/certification" },
        },
        {
          badge: "SGL",
          title: "Diamonds",
          body: "SGL certified, every single piece. Carat, colour (I–J), clarity (VS–SI). Certificate included with every diamond purchase. Verifiable online any time.",
          action: { label: "Read the certification", href: "/certification" },
        },
      ],
    },
    {
      type: "links",
      cards: [
        {
          heading: "Every piece is made by hand in our Kathmandu atelier",
          body: "Sketching, casting, setting, finishing — the full process, step by step.",
          action: { label: "How we make it", href: "/craftsmanship" },
        },
        {
          heading: "Visit the atelier — New Road, Kathmandu",
          body: "Try pieces on, or book a bridal consultation with our team.",
          action: { label: "Store details & hours", href: "/stores" },
        },
      ],
    },
    {
      type: "cta",
      heading: "Heirlooms you'll wear, then pass on.",
      body: "Browse the latest pieces online.",
      action: { label: "Shop the collection", href: "/jewellery" },
    },
  ],
} satisfies StoryPage;
