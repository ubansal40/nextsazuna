import type { Metadata } from "next";
import { PolicyPage } from "@/components/content/policy-page";
import { exchangeResale } from "@/lib/content-pages/policy/exchange-resale";

/**
 * Returns & Exchange — Sazuna Policy.dc.html.
 *
 * The Express storefront served this as /returns.html; the footer here has
 * always pointed at /exchange-resale, which describes the promise better — a
 * lifetime exchange and a buyback rate rather than a return window. The old URL
 * redirects (see next.config.ts).
 */

export const metadata: Metadata = {
  title: "Returns & Exchange",
  description:
    "Lifetime exchange at zero deduction on every SGL-certified diamond piece. 60% buyback on silver and gold-plated. In writing. No expiry.",
  alternates: { canonical: "/exchange-resale" },
};

export default function ExchangeResalePage() {
  return <PolicyPage page={exchangeResale} />;
}
