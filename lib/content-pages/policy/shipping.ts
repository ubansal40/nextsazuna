import type { PolicyPage } from "../types";

/**
 * Shipping & Delivery — ported from the Express storefront's
 * public/shipping.html, laid out per Sazuna Policy.dc.html.
 *
 * One departure from the source: the COD section listed Fonepay among the
 * prepaid methods a customer could switch to. The checkout implements eSewa,
 * Khalti, card and COD, so naming a fifth would promise something the payment
 * step cannot honour.
 */
export const shipping = {
  kicker: "Policy",
  title: "Shipping & Delivery",
  updated: "12 May 2026",
  sections: [
    {
      id: "free-shipping",
      heading: "Free shipping, every order",
      blocks: [
        {
          type: "p",
          text: "We ship every order free, nationwide across Nepal. There's no minimum order value, no shipping fee at checkout, no fine print. Pay only what the product costs.",
        },
        {
          type: "callout",
          text: "**Free shipping is included in every product price.** No surprise fees at checkout — what you see on the product card is what you pay.",
        },
      ],
    },
    {
      id: "delivery-times",
      heading: "Delivery times",
      blocks: [
        { type: "p", text: "Estimated delivery times by location:" },
        {
          type: "table",
          head: ["Region", "Cut-off", "Arrives"],
          rows: [
            [
              "Kathmandu Valley (Kathmandu, Lalitpur, Bhaktapur)",
              "Order before 2:00 PM",
              "Same day",
            ],
            ["Kathmandu Valley (after 2:00 PM)", "—", "Next business day"],
            ["Outside the Valley (Bagmati Province)", "Order before 5:00 PM", "1–2 business days"],
            [
              "Other provinces (Koshi, Madhesh, Gandaki, Lumbini, Karnali, Sudurpashchim)",
              "—",
              "2–4 business days",
            ],
          ],
        },
        {
          type: "p",
          text: "Public holidays may add a day. We message you on WhatsApp the moment your order is on its way and again when it's near.",
        },
      ],
    },
    {
      id: "cod",
      heading: "Cash on Delivery",
      blocks: [
        {
          type: "p",
          text: "**COD is available everywhere we ship in Nepal.** Pay the delivery agent in cash at your doorstep — no advance, no online payment required. You can also switch to a prepaid method (eSewa, Khalti, card) any time before shipment by replying to our WhatsApp message.",
        },
      ],
    },
    {
      id: "packaging",
      heading: "Packaging & security",
      blocks: [
        {
          type: "p",
          text: "Every order ships in a tamper-evident pouch tucked inside a Sazuna gift box. If you've selected the gift wrap option on your cart, we add a maroon ribbon and a hand-written note card.",
        },
        {
          type: "p",
          text: "Pieces over रु 25,000 are sent via insured courier with proof-of-delivery + photo confirmation. We do not ship currency or cards in the box — your invoice arrives separately via email and WhatsApp.",
        },
      ],
    },
    {
      id: "international",
      heading: "International shipping",
      blocks: [
        {
          type: "p",
          text: "We currently ship only within Nepal. If you'd like a piece sent to family abroad, message us on WhatsApp — we'll arrange a private courier on your behalf (you'll cover the courier fee at cost, no markup).",
        },
      ],
    },
    {
      id: "tracking",
      heading: "Tracking your order",
      blocks: [
        {
          type: "p",
          text: "Every order gets a WhatsApp thread with us. Reply to that thread any time with “Where is my order?” and we'll send a fresh status. Once the courier has the package, we share their tracking link if available.",
        },
        {
          type: "p",
          text: "You can also [track any order yourself](/order-status) with your order number and the phone or email you used at checkout — no account needed.",
        },
      ],
    },
  ],
  cta: {
    heading: "Question about your delivery?",
    body: "Ping us on WhatsApp with your order number — usually a 5-minute reply.",
    whatsappText: "Hi, I have a question about my delivery. My order number is ___.",
    buttonLabel: "WhatsApp us",
  },
} satisfies PolicyPage;
