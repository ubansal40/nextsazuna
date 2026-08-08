import type { Metadata } from "next";
import { getWhatsAppHref } from "@/lib/content";
import { CheckoutView } from "./_components/checkout-view";

/**
 * Checkout — Sazuna Checkout.dc.html.
 *
 * A thin server shell; the bag lives in the browser. The header renders its
 * stripped "secure checkout" variant on this route — see SiteHeader.
 */

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string }>;
}) {
  const [whatsappHref, params] = await Promise.all([getWhatsAppHref(), searchParams]);

  return (
    <div className="mx-auto max-w-[var(--sz-container)] px-10 pb-24 checkout-stacked:pb-[120px] checkout-narrow:px-[18px]">
      <CheckoutView
        browseHref="/jewellery"
        whatsappHref={whatsappHref}
        // A gateway sends the customer back here when a payment falls over.
        failed={params.payment === "failed"}
      />
    </div>
  );
}
