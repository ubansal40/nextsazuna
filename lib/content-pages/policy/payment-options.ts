import type { PolicyPage } from "../types";

/**
 * Payment Options — the one content page not ported verbatim.
 *
 * The Express version described a storefront that no longer exists: six
 * methods, and an "our payment-gateway integrations are still rolling out"
 * note promising a WhatsApp payment link after checkout. The gateways are live
 * now and the customer pays in the checkout flow, so the old copy would have
 * told people to wait for a message that never arrives.
 *
 * What is documented here is what `payment_methods` actually has enabled —
 * Cash on Delivery, eSewa and card — with the 3% card surcharge that
 * app/checkout/_actions.ts really applies. Khalti and Fonepay are deliberately
 * absent: both are `is_enabled: false`, so neither appears at checkout. If
 * Khalti is switched back on, it needs a section here and carries 1%.
 */
export const paymentOptions = {
  kicker: "Policy",
  title: "Payment options",
  updated: "12 May 2026",
  sections: [
    {
      id: "overview",
      heading: "Overview",
      blocks: [
        {
          type: "p",
          text: "Choose whatever's easiest at checkout. All transactions are encrypted, and we never store your card number on our servers.",
        },
        {
          type: "ul",
          items: [
            "**Cash on Delivery** — pay the courier at your doorstep, no surcharge",
            "**eSewa** — Nepal's most-used digital wallet, no surcharge",
            "**Credit / Debit card** — Visa or Mastercard, 3% surcharge",
          ],
        },
      ],
    },
    {
      id: "cod",
      heading: "Cash on Delivery (COD)",
      blocks: [
        {
          type: "p",
          text: "Pay the courier in cash at your doorstep — anywhere in Nepal. **No advance payment**, no online step, no extra fee. Once the order is placed, we WhatsApp you with the dispatch update; you pay when the package arrives.",
        },
        {
          type: "p",
          text: "If you change your mind and want to switch to a prepaid method — for the convenience of a friend or family member receiving the order, say — just reply to our WhatsApp message any time before shipment.",
        },
      ],
    },
    {
      id: "esewa",
      heading: "eSewa",
      blocks: [
        {
          type: "p",
          text: "Nepal's most-used digital wallet. Choose eSewa at checkout and you're taken straight to eSewa to approve the payment; we're notified the moment it clears and your order moves to dispatch. Confirmation takes seconds.",
        },
      ],
    },
    {
      id: "card",
      heading: "Credit / Debit card (Visa, Mastercard)",
      blocks: [
        {
          type: "p",
          text: "Card payments are handled by CyberSource Secure Acceptance. You complete the payment on the gateway's own PCI-compliant page — your card details never touch our servers, and we never see them.",
        },
        {
          type: "p",
          text: "A **3% surcharge** applies to card payments. It is calculated on the amount actually being charged, after any promo code, and shown as its own line in the order summary before you confirm. No other method carries a surcharge.",
        },
      ],
    },
    {
      id: "cancellation",
      heading: "Cancellation & refunds",
      blocks: [
        {
          type: "p",
          text: "For prepaid orders, refunds go back to the original payment method within **7–10 business days** of the piece being received and inspected (for returns) or of the order being cancelled (before shipping). For COD, no refund mechanic is needed — you simply don't pay if you cancel before delivery.",
        },
        {
          type: "p",
          text: "See [Returns & Exchange](/exchange-resale) for how the inspection works and what the buyback rates are.",
        },
      ],
    },
    {
      id: "security",
      heading: "Security",
      blocks: [
        {
          type: "ul",
          items: [
            "The site uses HTTPS (TLS) end-to-end.",
            "Payment forms are hosted by the payment provider, not by us — we never see your card number.",
            "Our database stores only the payment method and a transaction reference, never the credentials.",
            "Every gateway response is verified against the provider directly before an order is marked paid, so a tampered return URL cannot mark an order as settled.",
          ],
        },
      ],
    },
  ],
  cta: {
    heading: "Trouble paying?",
    body: "WhatsApp us — we'll set up an alternative or walk through the issue with you.",
    whatsappText: "Hi, I have a payment question.",
    buttonLabel: "WhatsApp us",
  },
} satisfies PolicyPage;
