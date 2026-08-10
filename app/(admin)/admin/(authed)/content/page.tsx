import type { Metadata } from "next";
import { requireSection } from "@/lib/admin/require";
import { getEditableBlock } from "@/lib/admin/content";
import { readLayout } from "@/lib/admin/homepage-schema";
import { HomepageBuilder } from "./_components/homepage-builder";

export const metadata: Metadata = {
  title: "Site content",
  robots: { index: false, follow: false },
};

export default async function ContentPage() {
  await requireSection("content");
  const block = await getEditableBlock<{ blocks?: unknown }>("homepage_layout");

  return (
    <HomepageBuilder
      initial={readLayout(block.value)}
      updatedBy={block.updatedBy}
      updatedAt={block.updatedAt ? block.updatedAt.toISOString() : null}
    />
  );
}
