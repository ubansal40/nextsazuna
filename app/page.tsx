import type { Metadata } from "next";
import { listProducts, type SortKey } from "@/lib/catalog";
import { getHomepageBlocks } from "@/lib/homepage";
import { HeroCarousel } from "./_components/home/hero-carousel";
import { ProductEdit, type EditTab } from "./_components/home/product-edit";
import { ReviewsCarousel } from "./_components/home/reviews-carousel";
import { SectionHeading } from "./_components/home/section-heading";
import {
  CategoryTiles,
  CollectionCards,
  FeatureCards,
  FeaturedBanner,
  UspStrip,
} from "./_components/home/sections";

/**
 * Homepage — Sazuna Homepage.dc.html.
 *
 * Composed from the `homepage_layout` content block rather than hardcoded, so
 * the order of the sections, their copy and which appear at all are an admin
 * edit. A Server Component: only the two carousels and the product tabs are
 * client islands.
 */

/**
 * The whole page is admin-editable content, so it must not be frozen into the
 * build. Five minutes keeps it cheap while making a content edit show up
 * without a redeploy.
 */
export const revalidate = 300;

export const metadata: Metadata = {
  description:
    "Certified diamond and gold jewellery, handcrafted in Kathmandu. Every Sazuna diamond is SGL-graded and travels with its certificate.",
  alternates: { canonical: "/" },
};

const sectionClass =
  "mx-auto mt-[var(--sz-section-gap)] max-w-[var(--sz-container)] px-10 home-narrow:mt-[var(--sz-section-gap-sm)] home-narrow:px-5";

export default async function HomePage() {
  const blocks = await getHomepageBlocks();

  /**
   * Every product tab's list is fetched up front, in parallel, so switching
   * tabs on the client costs nothing. There are at most a couple of tabs and
   * the queries are small.
   */
  const editBlock = blocks.find((block) => block.type === "product_grid");
  const editTabs: EditTab[] = editBlock
    ? await Promise.all(
        editBlock.tabs.map(async (tab) => ({
          label: tab.label,
          products: (
            await listProducts({ sort: tab.sort as SortKey, pageSize: tab.limit, page: 1 })
          ).products,
        })),
      )
    : [];

  return (
    <>
      {blocks.map((block) => {
        switch (block.type) {
          case "hero":
            return (
              <section key={block.id} className="pt-5">
                <div className="mx-auto max-w-[var(--sz-container)] px-10 home-narrow:px-5">
                  <HeroCarousel slides={block.slides} autoplayMs={block.autoplayMs} />
                </div>
              </section>
            );

          case "category_grid":
            return block.layout === "card" ? (
              <CollectionCards
                key={block.id}
                eyebrow={block.eyebrow}
                heading={block.heading}
                link={block.link}
                tiles={block.tiles}
              />
            ) : (
              <CategoryTiles
                key={block.id}
                eyebrow={block.eyebrow}
                heading={block.heading}
                link={block.link}
                tiles={block.tiles}
              />
            );

          case "usp_strip":
            return <UspStrip key={block.id} items={block.items} />;

          case "product_grid":
            // Nothing to show is not an error — it just means the catalog is
            // empty, and an edit with no products is worse than no edit.
            if (!editTabs.some((tab) => tab.products.length)) return null;
            return (
              <section key={block.id} className={sectionClass}>
                <ProductEdit eyebrow={block.eyebrow} link={block.link} tabs={editTabs} />
              </section>
            );

          case "banner":
            return (
              <FeaturedBanner
                key={block.id}
                eyebrow={block.eyebrow}
                heading={block.heading}
                body={block.body}
                image={block.image}
                cta={block.cta}
              />
            );

          case "feature_cards":
            return (
              <FeatureCards
                key={block.id}
                eyebrow={block.eyebrow}
                heading={block.heading}
                cards={block.cards}
              />
            );

          case "reviews":
            return (
              <section key={block.id} className={sectionClass}>
                <SectionHeading eyebrow={block.eyebrow} heading={block.heading} centered />
                <ReviewsCarousel items={block.items} />
              </section>
            );
        }
      })}
    </>
  );
}
