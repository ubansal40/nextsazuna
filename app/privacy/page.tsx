import type { Metadata } from "next";
import { PolicyPage } from "@/components/content/policy-page";
import { privacy } from "@/lib/content-pages/policy/privacy";

/** Privacy Policy — Sazuna Policy.dc.html. */

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Sazuna Jewellers collects, uses, and protects your information.",
  alternates: { canonical: "/privacy" },
  /**
   * Not indexed, carried over from the Express storefront. A policy page ranks
   * for nothing the shop wants to be found for, and it is deliberately absent
   * from the sitemap so the two cannot contradict each other — the old app
   * listed it while serving noindex, which Search Console flags.
   */
  robots: { index: false, follow: true },
};

export default function PrivacyPage() {
  return <PolicyPage page={privacy} />;
}
