import type { PolicyPage } from "../types";

/**
 * Delete my data — ported from public/account-deletion.html.
 *
 * The retention figure is the one correction. The source said 5 years while
 * privacy.html said 7, for the same Nepali tax obligation; 7 is now used on
 * both. See lib/content-pages/policy/privacy.ts.
 *
 * The form is not in this data — it lives in the page, because it is behaviour
 * rather than copy. Its field lengths are a contract with the Server Action:
 * 200 / 30 / 120 / 2000, matching what requestAccountDeletion truncates to.
 */
export const accountDeletion = {
  kicker: "Your data",
  title: "Delete my data",
  updated: "12 May 2026",
  sections: [
    {
      id: "what-we-delete",
      heading: "What we delete on request",
      blocks: [
        {
          type: "ul",
          items: [
            "Your name, email address, phone number and shipping addresses from our order records.",
            "Saved cart, wishlist, and any marketing preferences (WhatsApp updates).",
            "Analytics and advertising identifiers we've sent to Meta (Pixel and Conversions API) tied to your visitor ID.",
            "Notify-me-when-back-in-stock subscriptions you've created.",
          ],
        },
      ],
    },
    {
      id: "what-we-keep",
      heading: "What we're required to keep (and why)",
      blocks: [
        {
          type: "ul",
          items: [
            "**GST / VAT invoices for past orders** — Nepal tax law requires us to retain transaction records for **7 years** after the financial year. We anonymise the personal fields wherever the law allows, but the invoice line itself stays.",
            "**Fraud and chargeback records** — retained only as long as the payment processor requires.",
            "**Order-status timestamps** for the items we're still legally bound to invoice.",
          ],
        },
      ],
    },
    {
      id: "how-long",
      heading: "How long it takes",
      blocks: [
        {
          type: "p",
          text: "We confirm receipt of every request within **3 business days** and complete deletion within **30 days**. We'll email you a confirmation once it's done. If you'd like to reach us directly instead of using the form, message us on WhatsApp or email [privacy@sazunajewellers.com](mailto:privacy@sazunajewellers.com).",
        },
      ],
    },
  ],
  cta: {
    heading: "Prefer to message us?",
    body: "WhatsApp works too — we'll take the request from there.",
    whatsappText: "Hi, I'd like to request deletion of my data.",
    buttonLabel: "WhatsApp us",
  },
} satisfies PolicyPage;
