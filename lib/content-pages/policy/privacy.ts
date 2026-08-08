import type { PolicyPage } from "../types";

/**
 * Privacy Policy — ported from the Express storefront's public/privacy.html.
 *
 * Three details were brought in line with the storefront as it now stands:
 * the newsletter opt-in no longer names a form (the newsletter was removed),
 * Fonepay is dropped from the list of payment processors (never integrated),
 * and the security section no longer describes the admin session mechanics,
 * which are implementation detail with a short shelf life.
 *
 * The 7-year retention figure is the source of truth; account-deletion.html
 * disagreed with it and has been corrected to match.
 */
export const privacy = {
  kicker: "Legal",
  title: "Privacy Policy",
  updated: "12 May 2026",
  sections: [
    {
      id: "overview",
      heading: "Overview",
      blocks: [
        {
          type: "p",
          text: "Sazuna Jewellers (“we”, “our”) is a Nepal-registered jewellery atelier operating [this website](/) (the “site”). This policy explains what personal data we collect, why, and what your rights are. We try to write it in plain language — if anything is unclear, message us on WhatsApp and we'll clarify.",
        },
      ],
    },
    {
      id: "what-we-collect",
      heading: "What we collect",
      blocks: [
        { type: "p", text: "When you browse, place an order, or message us, we may collect:" },
        {
          type: "ul",
          items: [
            "**Contact info** you give us — name, phone number, email (optional), shipping address.",
            "**Order details** — items bought, total, payment method, gift wrap or note preference.",
            "**Communications** — WhatsApp messages, emails, and any photos you send us.",
            "**Browsing data** — pages viewed, items added to cart, device type, approximate location (city level), referral source. This comes from cookies and similar technologies.",
          ],
        },
        {
          type: "p",
          text: "We do **not** collect or store your card number — the payment gateway handles that directly on its own servers.",
        },
      ],
    },
    {
      id: "how-we-use",
      heading: "How we use it",
      blocks: [
        { type: "p", text: "We use the information to:" },
        {
          type: "ul",
          items: [
            "Process and ship your order.",
            "Send order updates over WhatsApp (and email if you provided one).",
            "Answer your questions over WhatsApp or in store.",
            "Send occasional new-drop notifications — only if you've asked us to.",
            "Understand which products customers love (and which they don't) so we can plan better collections.",
            "Comply with Nepali tax and consumer-protection law.",
          ],
        },
      ],
    },
    {
      id: "meta-pixel",
      heading: "Meta Pixel & analytics",
      blocks: [
        {
          type: "p",
          text: "We use the Meta Pixel (Facebook/Instagram ads) and a small set of cookies to measure how our marketing performs. Specifically:",
        },
        {
          type: "ul",
          items: [
            "The Pixel fires events like PageView, AddToCart, InitiateCheckout and Purchase so we can see whether an ad turned into a real sale.",
            "The data sent to Meta is **hashed** — your name and phone are converted to one-way strings before they leave your browser.",
            "We do **not** sell your data to third parties.",
          ],
        },
        {
          type: "p",
          text: "You can opt out via the Meta ad preferences in your Facebook or Instagram account.",
        },
      ],
    },
    {
      id: "sharing",
      heading: "Who we share with",
      blocks: [
        { type: "p", text: "We share the minimum needed with:" },
        {
          type: "ul",
          items: [
            "**Couriers** (local Nepal logistics partners) — your name, address and phone, for delivery.",
            "**Payment providers** (eSewa, Khalti, CyberSource) — at most the amount and a reference number, when you choose to pay through them.",
            "**WhatsApp Business** (Meta) — your phone number, so we can reply on the platform you contacted us on.",
            "**Email provider** (Hostinger SMTP) — if you've given us an email for receipts.",
          ],
        },
        { type: "p", text: "We never sell, rent, or trade your personal information." },
      ],
    },
    {
      id: "retention",
      heading: "How long we keep it",
      blocks: [
        {
          type: "p",
          text: "Order records (name, address, items, total) are kept for **7 years** as required by Nepali tax law. Browsing analytics are kept for **26 months** (Meta's default). You can request deletion at any time — see your rights below.",
        },
      ],
    },
    {
      id: "rights",
      heading: "Your rights",
      blocks: [
        { type: "p", text: "You can ask us, at any time, to:" },
        {
          type: "ul",
          items: [
            "Show you what data we hold about you.",
            "Correct anything inaccurate.",
            "Delete your data (except records we are legally required to retain).",
            "Opt out of marketing — reply STOP to our WhatsApp updates or click unsubscribe in any email.",
          ],
        },
        {
          type: "p",
          text: "Use the [account deletion form](/account-deletion), email [privacy@sazunajewellers.com](mailto:privacy@sazunajewellers.com), or WhatsApp us. We respond within 7 days.",
        },
      ],
    },
    {
      id: "security",
      heading: "Security",
      blocks: [
        {
          type: "p",
          text: "The site uses HTTPS (TLS encryption) end-to-end. Order data is stored in a Hostinger-hosted MySQL database with access restricted to the founder.",
        },
      ],
    },
    {
      id: "changes",
      heading: "Changes to this policy",
      blocks: [
        {
          type: "p",
          text: "We may update this policy from time to time — material changes will be notified on this page and, for active customers, via WhatsApp. The “Last updated” date at the top is always current.",
        },
      ],
    },
    {
      id: "contact",
      heading: "Contact",
      blocks: [
        { type: "p", text: "For any privacy question or request:" },
        {
          type: "ul",
          items: [
            "WhatsApp: [+977 9801082897](https://wa.me/9779801082897)",
            "Email: [privacy@sazunajewellers.com](mailto:privacy@sazunajewellers.com)",
            "Mail: Sazuna Jewellers, New Road, Kathmandu 44600, Nepal",
          ],
        },
      ],
    },
  ],
  cta: {
    heading: "Privacy concern?",
    body: "Reach out — we respond within 7 days.",
    whatsappText: "Hi, I have a privacy question.",
    buttonLabel: "WhatsApp us",
  },
} satisfies PolicyPage;
