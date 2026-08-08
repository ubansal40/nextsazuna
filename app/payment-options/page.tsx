import type { Metadata } from "next";
import { PolicyPage } from "@/components/content/policy-page";
import { paymentOptions } from "@/lib/content-pages/policy/payment-options";

/**
 * Payment options — Sazuna Policy.dc.html.
 *
 * The method list is compiled in rather than read from the `payment_methods`
 * block. That is a deliberate trade: this page cannot follow an admin toggle,
 * so enabling or disabling a gateway needs the copy changed here too. In
 * exchange the page holds no gateway configuration, and the block that does —
 * which stores live secret keys alongside the labels — is never read by a
 * surface whose only job is to reassure someone before they pay.
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
