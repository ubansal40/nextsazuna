import type { Metadata } from "next";
import { PolicyPage } from "@/components/content/policy-page";
import { shipping } from "@/lib/content-pages/policy/shipping";

/**
 * Shipping & Delivery — Sazuna Policy.dc.html.
 *
 * The copy is compiled in rather than read from `content_blocks`, so the page
 * prerenders as static: the production build runs without database credentials,
 * and a shopper checking delivery times should not be waiting on a query.
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
