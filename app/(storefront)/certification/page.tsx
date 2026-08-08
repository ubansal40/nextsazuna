import type { Metadata } from "next";
import { PolicyPage } from "@/components/content/policy-page";
import { certification } from "@/lib/content-pages/policy/certification";

/** SGL Certification & Purity — Sazuna Policy.dc.html. See craftsmanship. */

export const metadata: Metadata = {
  title: "SGL Certification & Purity",
  description:
    "Every Sazuna diamond ships with an SGL certificate. Our silver is 92.5 sterling, gold-plated pieces use thick electroplate — all backed by our in-house purity guarantee.",
  alternates: { canonical: "/certification" },
};

export default function CertificationPage() {
  return <PolicyPage page={certification} />;
}
