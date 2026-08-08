import type { Metadata } from "next";
import { StoryPage } from "@/components/content/story-page";
import { about } from "@/lib/content-pages/story/about";

/** About — Sazuna Story.dc.html. */

export const metadata: Metadata = {
  title: "About Sazuna",
  description:
    "Sazuna Jewellers is a Kathmandu-born atelier — SGL certified diamonds at honest prices, 92.5 sterling silver with an in-house guarantee, handmade by people who put their name on every piece.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return <StoryPage page={about} />;
}
