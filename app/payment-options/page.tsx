import type { Metadata } from "next";
import { PolicyPage } from "@/components/content/policy-page";
import { paymentOptions } from "@/lib/content-pages/policy/payment-options";

/**
 * Payment options — Sazuna Policy.dc.html.
 *
 * Static, like the other policy pages, which means the method list is compiled
 * in rather than read from the `payment_methods` block. That is a deliberate
 * trade: this page cannot follow an admin toggle, so enabling or disabling a
 * gateway needs the copy changed here too. Reading the block instead would make
 * the page dynamic and put a database query in front of a page whose whole job
 * is to reassure someone before they pay.
 */

export const metadata: Metadata = {
  title: "Payment options",
  description:
    "Pay with Cash on Delivery, eSewa, or Visa and Mastercard — anywhere in Nepal. All transactions are encrypted.",
  alternates: { canonical: "/payment-options" },
};

export default function PaymentOptionsPage() {
  return <PolicyPage page={paymentOptions} />;
}
