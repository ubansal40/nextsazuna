import type { Metadata } from "next";
import { PolicyPage } from "@/components/content/policy-page";
import { terms } from "@/lib/content-pages/policy/terms";

/** Terms of Service — Sazuna Policy.dc.html. */

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms under which Sazuna Jewellers offers products and services online.",
  alternates: { canonical: "/terms" },
  /** Not indexed, and absent from the sitemap — see app/privacy/page.tsx. */
  robots: { index: false, follow: true },
};

export default function TermsPage() {
  return <PolicyPage page={terms} />;
}
