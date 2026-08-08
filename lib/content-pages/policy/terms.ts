import type { PolicyPage } from "../types";

/**
 * Terms of Service — ported from the Express storefront's public/terms.html.
 *
 * Internal links are rewritten off the old `.html` URLs, and the payment
 * section names the methods checkout actually offers rather than the six the
 * old copy listed.
 */
export const terms = {
  kicker: "Legal",
  title: "Terms of Service",
  updated: "12 May 2026",
  sections: [
    {
      id: "agreement",
      heading: "Agreement",
      blocks: [
        {
          type: "p",
          text: "By browsing or placing an order on this website, you agree to these terms. If you don't, please don't use the site. The terms are governed by the laws of Nepal.",
        },
      ],
    },
    {
      id: "eligibility",
      heading: "Eligibility",
      blocks: [
        {
          type: "p",
          text: "You must be 18 or older (or have a parent or guardian's consent) to place an order. Orders are delivered within Nepal only — we currently don't ship internationally (see [Shipping & Delivery](/shipping)).",
        },
      ],
    },
    {
      id: "product-info",
      heading: "Product information",
      blocks: [
        {
          type: "p",
          text: "We make every effort to display products accurately — including colour, finish and dimensions — but on-screen rendering will always differ slightly from reality. Diamond cut and clarity are accurately described per the SGL certificate that ships with the piece. If a product's actual properties differ materially from how we described it, we'll exchange or refund — see [Returns & Exchange](/exchange-resale).",
        },
      ],
    },
    {
      id: "pricing",
      heading: "Pricing & availability",
      blocks: [
        {
          type: "p",
          text: "All prices are in **Nepalese Rupees (NPR / रु)** and include VAT where applicable. Free shipping is included in the price. Prices may change without notice; once your order is confirmed, the price you saw at checkout is the price you pay.",
        },
        {
          type: "p",
          text: "In the rare event a product is listed with a clear mistake — a रु 10 typo where it should be रु 100,000 — we may cancel the order and refund any payment made, before shipping.",
        },
      ],
    },
    {
      id: "payment",
      heading: "Payment",
      blocks: [
        {
          type: "p",
          text: "We accept Cash on Delivery, eSewa, and Visa or Mastercard. For prepaid methods, the order ships after payment is confirmed. For COD, you pay the courier at delivery. A 3% surcharge applies to card payments and is shown before you confirm.",
        },
        { type: "p", text: "See [Payment options](/payment-options) for full details." },
      ],
    },
    {
      id: "cancellation",
      heading: "Cancellation & refunds",
      blocks: [
        {
          type: "p",
          text: "You can cancel an order before it ships at no charge. After shipment, the cancellation flows through our regular returns process — see [Returns & Exchange](/exchange-resale). Refunds for prepaid orders are issued to the original payment method within 7–10 business days of the piece being received and inspected.",
        },
      ],
    },
    {
      id: "intellectual-property",
      heading: "Intellectual property",
      blocks: [
        {
          type: "p",
          text: "The Sazuna name, logo, photography, product descriptions and overall site design are owned by Sazuna Jewellers. Don't copy, reproduce or use them commercially without our written permission. Personal use — saving a product image for your own reference, say — is fine.",
        },
      ],
    },
    {
      id: "user-content",
      heading: "User content",
      blocks: [
        {
          type: "p",
          text: "If you share photos, reviews or messages with us, you grant Sazuna a non-exclusive licence to share them on our site or social channels — always with credit, and removable on request.",
        },
      ],
    },
    {
      id: "liability",
      heading: "Limitation of liability",
      blocks: [
        {
          type: "p",
          text: "Sazuna is not liable for indirect or consequential damages — lost income, missed events — arising from a delivery delay, product fault or site downtime. Our maximum liability for any single transaction is capped at the amount you paid for the order in question.",
        },
      ],
    },
    {
      id: "disputes",
      heading: "Disputes",
      blocks: [
        {
          type: "p",
          text: "If something goes wrong, we'd much rather solve it directly — message us on WhatsApp and we'll work it out. If we can't, any unresolved dispute is subject to the exclusive jurisdiction of the courts in Kathmandu, Nepal.",
        },
      ],
    },
    {
      id: "changes",
      heading: "Changes to these terms",
      blocks: [
        {
          type: "p",
          text: "We may update these terms occasionally. Material changes will be flagged on this page; the “Last updated” date stays current.",
        },
      ],
    },
    {
      id: "contact",
      heading: "Contact",
      blocks: [
        {
          type: "ul",
          items: [
            "WhatsApp: [+977 9801082897](https://wa.me/9779801082897)",
            "Email: [hello@sazunajewellers.com](mailto:hello@sazunajewellers.com)",
            "Mail: Sazuna Jewellers, New Road, Kathmandu 44600, Nepal",
          ],
        },
      ],
    },
  ],
  cta: {
    heading: "Question about the terms?",
    body: "WhatsApp us — happy to clarify anything in plain language.",
    whatsappText: "Hi, I have a question about your terms.",
    buttonLabel: "WhatsApp us",
  },
} satisfies PolicyPage;
