import type { PolicyPage } from "../types";

/**
 * Craftsmanship — ported from the Express storefront's public/craftsmanship.html.
 *
 * Laid out as a policy page rather than a story page, though the design project
 * files it under Sazuna Story.dc.html. The spec's story treatment for this page
 * is five marketing blocks over about 150 words; the real page is 588 words of
 * process detail with sub-headings and lists, and the Express app itself served
 * it as `data-page="policy"` alongside shipping and terms. The policy layout is
 * the one that can carry it, table of contents included.
 */
export const craftsmanship = {
  kicker: "How we make it",
  title: "Craftsmanship",
  updated: "12 May 2026",
  sections: [
    {
      id: "materials",
      heading: "Materials",
      blocks: [
        { type: "h3", text: "Silver — 92.5 sterling" },
        {
          type: "p",
          text: "All Sazuna silver pieces are **92.5% pure sterling silver** — the international jewellery-grade standard. The remaining 7.5% is copper, which gives the silver enough hardness to hold a stone setting and take a high polish. Pure silver alone is too soft.",
        },
        {
          type: "p",
          text: "Backed by our **in-house purity guarantee** on every invoice. If an independent assay ever shows below 92.5%, we refund the piece in full plus the assay fee.",
        },
        { type: "h3", text: "Gold plating — 14k / 18k, 2.5 µ minimum" },
        {
          type: "p",
          text: "Our gold-plated pieces are 92.5 sterling underneath, electroplated with **14k or 18k gold at a minimum thickness of 2.5 microns**. That's about 5× the thickness of “fashion” plating (usually a 0.5 µ flash plate) and lasts 3–5 years with normal wear.",
        },
        { type: "h3", text: "Diamonds — SGL certified" },
        {
          type: "p",
          text: "Every diamond is independently SGL certified before it reaches the bench. Typical retail range: colour I–J (near-colourless, eye-clean), clarity VS–SI (inclusions invisible to the naked eye). The certificate ships with the piece.",
        },
      ],
    },
    {
      id: "design",
      heading: "Design",
      blocks: [
        {
          type: "p",
          text: "Every piece begins as a pencil sketch — proportions, stone placement, the curve of the band. We refine until the design earns its place. Designs that feel derivative or trend-bound never make it past this step.",
        },
        {
          type: "p",
          text: "For custom bridal sets and one-off commissions, we sketch directly with the client over WhatsApp or in-store consultation. Custom typically takes 4–6 weeks from sign-off to delivery.",
        },
      ],
    },
    {
      id: "casting",
      heading: "Casting & forming",
      blocks: [
        {
          type: "p",
          text: "For most designs we use the **lost-wax casting** method — a wax model is shaped, encased in plaster, then melted out as molten 92.5 silver is poured in. The result is a near-final form that's hand-finished from there.",
        },
        {
          type: "p",
          text: "Simpler pieces — chains, bangles — are **hand-formed** from drawn wire, soldered, and shaped on a mandrel.",
        },
      ],
    },
    {
      id: "stone-setting",
      heading: "Stone setting",
      blocks: [
        {
          type: "p",
          text: "Every diamond is hand-set under **10× magnification** by a master setter. The piece is held in a steel cup while prongs are tightened by hand — never machine — so the stone is held tightly without crushing the girdle.",
        },
        { type: "p", text: "We use four common setting styles:" },
        {
          type: "ul",
          items: [
            "**Prong (claw):** 4 or 6 metal claws hold the stone — maximum light return.",
            "**Bezel:** a metal collar wraps the stone — protected, modern look.",
            "**Pavé:** tiny stones set close together — sparkles across the piece.",
            "**Channel:** stones set in a continuous metal channel — sleek, durable.",
          ],
        },
      ],
    },
    {
      id: "polishing",
      heading: "Polishing & finishing",
      blocks: [
        {
          type: "p",
          text: "Each piece goes through 3–4 polishing stages on a buffing wheel — from coarse to mirror — taking 30 minutes to a few hours depending on size. Plating goes on as the final step: the piece is electrocleaned, rinsed, then submerged in a gold solution under controlled current for 4–6 minutes.",
        },
      ],
    },
    {
      id: "quality-check",
      heading: "Quality check",
      blocks: [
        {
          type: "p",
          text: "Before any piece leaves the atelier, two team members inspect it independently for:",
        },
        {
          type: "ul",
          items: [
            "Setting tension — every prong or claw passes a finger-pull test.",
            "Surface finish — no visible burrs, scratches or polish marks.",
            "Weight — matches the listed gross and silver weight on the SKU spec card.",
            "Certificate match — for diamonds, the SGL number on the certificate matches the laser-inscribed stone.",
          ],
        },
        { type: "p", text: "Only after both checks pass does a piece earn its packing." },
      ],
    },
    {
      id: "why-handmade",
      heading: "Why handmade matters",
      blocks: [
        {
          type: "p",
          text: "Factory production is cheaper and faster, but it can't iterate on small flaws in real time. A hand-setter sees the stone misaligning by a tenth of a millimetre and adjusts on the spot. A polishing tech sees the silver streaking in one direction and changes wheel speed. Mass production can't.",
        },
        {
          type: "p",
          text: "The trade-off: our pieces ship in 1–14 days rather than minutes. We think it's worth it. Our customers seem to as well.",
        },
      ],
    },
  ],
  cta: {
    heading: "Want to see the atelier?",
    body: "Visit us at New Road, Kathmandu — Mon–Sat, 10 AM – 8 PM. Or book a try-on visit.",
    whatsappText: "Hi, I'd like to book a try-on visit. My preferred time is ___.",
    buttonLabel: "WhatsApp us",
  },
} satisfies PolicyPage;
