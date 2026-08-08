import type { PolicyPage } from "../types";

/**
 * Returns & Exchange — ported from the Express storefront's
 * public/returns.html, laid out per Sazuna Policy.dc.html.
 *
 * Served at /exchange-resale rather than /returns: the shop's promise is a
 * lifetime exchange and a buyback rate, not a return window, and the footer
 * already names it that way. /returns.html redirects here.
 */
export const exchangeResale = {
  kicker: "Policy",
  title: "Returns & Exchange",
  updated: "12 May 2026",
  sections: [
    {
      id: "diamond",
      heading: "Diamond jewellery",
      blocks: [
        { type: "p", text: "Our diamond exchange policy is one of the most generous in Nepal:" },
        {
          type: "ul",
          items: [
            "**Exchange anytime — zero deduction.** Only VAT and Luxury Tax is deducted from the credit you receive.",
            "**Resell back to us — 10% deduction** (plus VAT and Luxury Tax) on the diamond piece's original price.",
          ],
        },
        { type: "quote", text: "In writing. No fine print. No expiry." },
        {
          type: "p",
          text: "Every diamond purchase ships with an SGL certificate that we honour for the life of the piece. The original SGL certificate must be present at the time of exchange or resale.",
        },
      ],
    },
    {
      id: "silver",
      heading: "Silver & gold-plated silver",
      blocks: [
        {
          type: "p",
          text: "Pieces in 92.5 sterling silver and gold-plated silver are eligible for a **60% buyback** on both exchange and resale. This applies whether you're upgrading to a new design or selling back to us.",
        },
        {
          type: "p",
          text: "This rate reflects the silver content + craftsmanship value — it's not a fee on you. Compare it to the typical 30–40% other Nepal retailers offer and you'll see why our customers come back.",
        },
      ],
    },
    {
      id: "table",
      heading: "Buyback summary",
      blocks: [
        {
          type: "table",
          head: ["Material", "Exchange", "Resell back"],
          rows: [
            ["**Diamond**", "100% credit (zero deduction)", "90% credit (10% deduction)"],
            ["**Silver (92.5)**", "60% credit", "60% credit"],
            ["**Gold-plated silver**", "60% credit", "60% credit"],
          ],
        },
        {
          type: "note",
          text: "All percentages are calculated on the piece's original purchase price. VAT and Luxury Tax are deducted separately as required by Nepal law.",
        },
      ],
    },
    {
      id: "how-to-exchange",
      heading: "How to exchange or return",
      blocks: [
        { type: "p", text: "It's deliberately low-friction:" },
        {
          type: "ol",
          items: [
            "WhatsApp us at [+977 9801082897](https://wa.me/9779801082897) with your **order number** (you'll find it in your order confirmation message).",
            "Tell us what you'd like to do — exchange for another piece, or resell back for credit.",
            "We arrange free pickup anywhere in Nepal, or you bring the piece to our New Road, Kathmandu atelier — whichever is easier.",
            "We inspect the piece, verify the certificate (for diamonds) or weight (for silver/plated), and process the credit or new piece on the spot.",
          ],
        },
        {
          type: "callout",
          text: "The piece must be in resalable condition — original certificate (diamonds), no major damage, and ideally in its original packaging. Light wear from normal use is fine.",
        },
      ],
    },
    {
      id: "size-fit",
      heading: "15-day fit guarantee",
      blocks: [
        {
          type: "p",
          text: "If a ring or bracelet doesn't fit when you receive it, we resize or replace it for free within **15 days** of delivery. Just WhatsApp us a photo of the piece on your finger or wrist and we'll guide you through the next step.",
        },
      ],
    },
    {
      id: "cancellations",
      heading: "Order cancellations",
      blocks: [
        {
          type: "p",
          text: "If you'd like to cancel an order before it ships, message us as soon as possible — we typically dispatch same day in Kathmandu Valley. Once shipped, the cancellation flows through the normal returns process above.",
        },
      ],
    },
  ],
  cta: {
    heading: "Ready to exchange or return?",
    body: "Have your order number ready — we'll handle the rest.",
    whatsappText: "Hi, I'd like to exchange/return an order. My order number is ___.",
    buttonLabel: "WhatsApp us about a return",
  },
} satisfies PolicyPage;
