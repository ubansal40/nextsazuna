import type { Metadata } from "next";
import { PolicyPage } from "@/components/content/policy-page";
import { craftsmanship } from "@/lib/content-pages/policy/craftsmanship";

/**
 * Craftsmanship — Sazuna Policy.dc.html.
 *
 * The design project files this under the story pages, but its copy is 588
 * words of process detail with sub-headings and lists, and the Express app
 * served it as a doc page. The policy layout is the one that carries it.
 */

export const metadata: Metadata = {
  title: "Craftsmanship",
  description:
    "How Sazuna Jewellers designs, casts, sets, and finishes every piece by hand in our Kathmandu atelier — using 92.5 sterling silver, SGL-certified diamonds, and 14k/18k gold plating.",
  alternates: { canonical: "/craftsmanship" },
};

export default function CraftsmanshipPage() {
  return <PolicyPage page={craftsmanship} />;
}
