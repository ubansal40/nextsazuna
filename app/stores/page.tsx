import type { Metadata } from "next";
import { StoryPage } from "@/components/content/story-page";
import { stores } from "@/lib/content-pages/story/stores";

/** Visit us — Sazuna Story.dc.html. */

export const metadata: Metadata = {
  title: "Visit Our Atelier",
  description:
    "Visit the Sazuna Jewellers atelier in Kathmandu. Try on SGL-certified diamond, gold-plated, and sterling silver pieces in person. Mon–Sat, 10 AM – 8 PM.",
  alternates: { canonical: "/stores" },
};

export default function StoresPage() {
  return <StoryPage page={stores} />;
}
