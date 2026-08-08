import type { Metadata } from "next";
import { PolicyPage } from "@/components/content/policy-page";
import { shipping } from "@/lib/content-pages/policy/shipping";

/**
 * Shipping & Delivery — Sazuna Policy.dc.html.
 *
 * The copy is compiled in rather than read from `content_blocks`, so the page
 * itself makes no query and the production build needs no database.
 *
 * It is still rendered per request, because the shared shell reads the
 * announcement bar, the WhatsApp number and the session. Prerendering it froze
 * those reads at build time — where there are deliberately no credentials — and
 * baked in a page with no floating WhatsApp button and an empty footer contact
 * column. A fast page wearing a broken shell is not a saving.
 */

export const metadata: Metadata = {
  title: "Shipping & Delivery",
  description:
    "Free shipping nationwide, no minimum. Same-day in Kathmandu Valley. Insured, tamper-evident packaging. Cash on Delivery available everywhere in Nepal.",
  alternates: { canonical: "/shipping" },
};

export default function ShippingPage() {
  return <PolicyPage page={shipping} />;
}
