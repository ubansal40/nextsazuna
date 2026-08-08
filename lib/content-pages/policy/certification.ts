import type { PolicyPage } from "../types";

/**
 * SGL Certification & Purity — ported from public/certification.html.
 *
 * A policy-layout page for the same reason as craftsmanship: 645 words with
 * sub-headings, lists and a closing pair of disclosures, served by the Express
 * app as `data-page="policy"`.
 */
export const certification = {
  kicker: "Certification",
  title: "SGL Certification & Purity",
  updated: "12 May 2026",
  sections: [
    {
      id: "what-is-sgl",
      heading: "What is SGL certification?",
      blocks: [
        {
          type: "p",
          text: "**SGL (Solitaire Gemmological Laboratories)** is an independent diamond grading lab with offices in India, the UK and the UAE. They are members of **CIBJO** (the World Jewellery Confederation) and use the same 4C grading standard — Cut, Colour, Clarity, Carat — that GIA and IGI use.",
        },
        {
          type: "p",
          text: "Every diamond piece you buy from Sazuna ships with an SGL certificate that specifies:",
        },
        {
          type: "ul",
          items: [
            "**Carat weight** — to two decimal places",
            "**Colour** — typically I–J for our retail range (near-colourless, eye-clean)",
            "**Clarity** — typically VS–SI (inclusions invisible to the naked eye)",
            "**Cut grade** — proportions, polish, symmetry",
            "A unique certificate number you can use to verify online",
          ],
        },
      ],
    },
    {
      id: "verify",
      heading: "How to verify your certificate",
      blocks: [
        {
          type: "p",
          text: "Visit [sglindia.com/verify](https://www.sglindia.com/verify) and enter the certificate number printed on the SGL card you received with your diamond. The lab's report will load instantly. If the report doesn't match what's on your card — or if the report doesn't exist — message us on WhatsApp and we'll resolve it the same day.",
        },
        {
          type: "callout",
          text: "**Why we use SGL instead of in-house grading:** independent labs cannot misgrade in our favour. The certificate is the same instrument a jeweller's appraiser would use — meaning the piece's resale value is anchored, not invented by us.",
        },
      ],
    },
    {
      id: "silver",
      heading: "Our silver — 92.5 sterling",
      blocks: [
        {
          type: "p",
          text: "All our silver pieces are **92.5% pure sterling silver**, the international standard for jewellery-grade silver. The remaining 7.5% is copper, which gives the silver its working hardness — pure silver is too soft to hold a setting or take polish.",
        },
        { type: "h3", text: "Our in-house purity guarantee" },
        {
          type: "p",
          text: "Every Sazuna silver piece carries an in-house purity guarantee, in writing, on the order invoice. If an independent assay — we'll cover the cost — ever shows the silver is below 92.5%, we'll refund the piece in full plus the assay fee, no questions.",
        },
        { type: "h3", text: "Why no formal hallmark?" },
        {
          type: "p",
          text: "Nepal doesn't currently operate a state-run silver hallmarking program, and the Bureau of Indian Standards' BIS hallmark doesn't apply outside India. Rather than print a hallmark logo we have no right to use — or pay for a foreign one that's irrelevant to a Nepal customer — we issue our own purity guarantee. We believe it's more honest to put our own name on the line than to borrow a stamp we can't certify.",
        },
      ],
    },
    {
      id: "gold-plating",
      heading: "Our gold plating",
      blocks: [
        {
          type: "p",
          text: "Our gold-plated silver pieces are 92.5 sterling underneath, electroplated with **14k or 18k gold** at a minimum thickness of **2.5 microns**. That's about 5× the thickness of typical fashion plating, which is usually a 0.5 µ flash plate. With normal care it lasts 3–5 years; with light wear, often longer.",
        },
        {
          type: "p",
          text: "We re-plate any Sazuna gold-plated piece at cost — around रु 1,500 depending on the size. Bring it in to the atelier and we send it back to the bench for refinishing.",
        },
      ],
    },
    {
      id: "care",
      heading: "Care to make it last",
      blocks: [
        {
          type: "ul",
          items: [
            "Apply perfume, lotion and hairspray **before** putting your jewellery on.",
            "Take pieces off before showering, swimming or strenuous exercise.",
            "Store each piece individually — the soft pouch your order arrived in is perfect.",
            "For silver: a quick rub with a microfibre cloth restores shine. Avoid silver dip or liquid polish — it wears plating.",
            "For diamonds: warm water, a drop of mild detergent and a soft toothbrush. Rinse, pat dry.",
          ],
        },
      ],
    },
    {
      id: "quick-faq",
      heading: "Quick FAQ",
      blocks: [
        {
          type: "faq",
          items: [
            {
              id: "is-sgl-the-same-as-gia",
              question: "Is SGL the same as GIA?",
              answer:
                "Both grade by the same 4C standard. GIA is the most recognised lab globally; SGL is widely accepted in South Asia and uses the same equipment. We chose SGL because it certifies in India at a fraction of GIA's fee — savings we pass to you in the piece's final price rather than the certificate's.",
            },
            {
              id: "what-if-my-silver-tarnishes",
              question: "What if my silver tarnishes?",
              answer:
                "Sterling silver oxidises on contact with air — that's chemistry, not a defect. A microfibre cloth rub takes the bloom off in seconds. If a piece needs deep cleaning, bring it to the atelier and we re-polish it free.",
            },
          ],
        },
      ],
    },
  ],
  cta: {
    heading: "Questions about your piece?",
    body: "WhatsApp us — we'll walk through the certificate or guarantee with you.",
    whatsappText: "Hi, I have a question about my certificate/guarantee.",
    buttonLabel: "WhatsApp us",
  },
} satisfies PolicyPage;
