import type { FaqPage } from "../types";

/**
 * FAQs — ported from the Express storefront's public/faqs.html.
 *
 * Twelve questions across five topics, in the source's own order. The item ids
 * are the slugs the old page used, so a link someone saved to
 * /faqs.html#how-do-i-know-what-size-i-am still opens the right panel.
 *
 * The "Full policy →" style links are rewritten off the old .html URLs.
 */
export const faqs = {
  kicker: "Help centre",
  title: "Frequently asked questions",
  updated: "12 May 2026",
  topics: [
    {
      id: "buying",
      title: "Buying",
      items: [
        {
          id: "how-do-i-know-what-size-i-am",
          question: "How do I know what size I am?",
          answer:
            "For rings, our atelier can size your finger in person, or you can WhatsApp us a tracing of a ring you already wear. We also send free physical sizing rings on request — message us your address.",
        },
        {
          id: "can-i-customize-a-piece",
          question: "Can I customize a piece?",
          answer:
            "Yes — we do custom bridal sets, engraving (up to 12 characters), and resizing on existing designs. Bridal consultations are by appointment at the New Road atelier. Custom typically takes 4–6 weeks.",
        },
        {
          id: "is-cod-really-available",
          question: "Is COD really available?",
          answer:
            "Yes, on every order, everywhere in Nepal. Pay the courier at your doorstep — no advance, no online payment, no extra fee. You can also start with COD and switch to a prepaid method by replying to our WhatsApp message.",
        },
      ],
    },
    {
      id: "shipping",
      title: "Shipping",
      items: [
        {
          id: "how-long-does-delivery-take",
          question: "How long does delivery take?",
          answer:
            "Same day in Kathmandu Valley if you order before 2 PM, next day after. 1–2 days for the rest of Bagmati Province, and 2–4 days for the other six provinces. [Full delivery times →](/shipping)",
        },
        {
          id: "do-you-ship-outside-kathmandu",
          question: "Do you ship outside Kathmandu?",
          answer:
            "Yes — we ship to all 7 provinces of Nepal, free. We currently don't ship internationally, but if you'd like a piece sent abroad, message us on WhatsApp and we'll arrange a private courier at cost.",
        },
        {
          id: "is-shipping-really-free",
          question: "Is shipping really free?",
          answer:
            "Yes — free, on every order, no minimum, no fine print. The price you see on the product card is the price you pay.",
        },
      ],
    },
    {
      id: "returns-exchange",
      title: "Returns & exchange",
      items: [
        {
          id: "what-if-it-doesnt-fit",
          question: "What if it doesn't fit?",
          answer:
            "We resize or replace rings and bracelets for free within 15 days of delivery. Just WhatsApp us a photo of the piece on your finger or wrist and we'll guide you through.",
        },
        {
          id: "how-does-the-diamond-exchange-work",
          question: "How does the diamond exchange work?",
          answer:
            "Lifetime exchange at zero deduction — only VAT and Luxury Tax is deducted. Resell back to us at 90% (10% deduction plus VAT and Luxury Tax). Original SGL certificate must be present. [Full policy →](/exchange-resale)",
        },
      ],
    },
    {
      id: "care",
      title: "Care",
      items: [
        {
          id: "how-do-i-keep-my-silver-shiny",
          question: "How do I keep my silver shiny?",
          answer:
            "A quick rub with a microfibre cloth restores shine. Avoid silver-dip / liquid polish — it wears plating. Store each piece individually in the pouch your order arrived in.",
        },
        {
          id: "can-i-shower-in-my-gold-plated-piece",
          question: "Can I shower in my gold-plated piece?",
          answer:
            "Best not to. Plating lasts longer if you apply perfume, lotion, and water before putting your jewellery on, and remove it before showering or swimming.",
        },
      ],
    },
    {
      id: "certification",
      title: "Certification",
      items: [
        {
          id: "what-does-sgl-certification-mean",
          question: "What does SGL certification mean?",
          answer:
            "SGL (Solitaire Gemmological Laboratories) is an independent diamond grading lab that certifies the diamond's carat, colour, clarity, and cut using the international 4C standard. Every Sazuna diamond ships with an SGL certificate you can verify online. [Full details →](/certification)",
        },
        {
          id: "is-your-silver-hallmarked",
          question: "Is your silver hallmarked?",
          answer:
            "Nepal doesn't operate a state-run silver hallmark program. Our silver is 92.5 sterling, backed by an in-house purity guarantee in writing on every invoice. If an independent assay ever shows below 92.5, we'll refund the piece in full.",
        },
      ],
    },
  ],
  cta: {
    heading: "Question not answered here?",
    body: "Ping us on WhatsApp — we usually reply in minutes.",
    whatsappText: "Hi, I have a question.",
    buttonLabel: "WhatsApp us",
  },
} satisfies FaqPage;
