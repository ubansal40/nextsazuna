import type { Metadata } from "next";
import { listProducts, type SortKey } from "@/lib/catalog";
import { bracketById, getFacets } from "@/lib/catalog/facets";
import { readFilters, type RawParams, readSort } from "@/lib/catalog/filter-params";
import { ProductListingView } from "./[slug]/_components/product-listing";

/**
 * Every piece — /jewellery.
 *
 * The homepage's "View all" links and hero calls to action need an unscoped
 * listing to land on; `/jewellery/{slug}.html` only ever serves one taxonomy.
 * Same listing surface as a category page, with no taxonomy filter applied.
 */

const STEP = 24;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export const metadata: Metadata = {
  title: "All jewellery",
  description:
    "Every certified diamond and gold piece at Sazuna Jewellers — rings, earrings, mangalsutra, necklaces, pendants and more.",
  alternates: { canonical: "/jewellery" },
};

export default async function AllJewelleryPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  const q = await searchParams;
  const filters = readFilters(q);

  const sort = readSort(one(q.sort));

  const [listing, facets] = await Promise.all([
    listProducts({
      categorySlugs: filters.cat.length ? filters.cat : undefined,
      collectionSlugs: filters.collection.length ? filters.collection : undefined,
      material: filters.material.length ? filters.material : undefined,
      purity: filters.purity.length ? filters.purity : undefined,
      priceBrackets: filters.price.length
        ? filters.price.map(bracketById).filter((b) => b !== null)
        : undefined,
      sort: sort as SortKey,
      page: 1,
      pageSize: STEP,
    }),
    getFacets(),
  ]);

  return (
    <ProductListingView
      heading="All jewellery"
      subheading="Every certified piece, from everyday studs to the bridal vault."
      basePath="/jewellery"
      listing={listing}
      facets={facets}
      state={filters}
      sort={sort}
      pageSize={STEP}
      request={{ filters, sort }}
    />
  );
}
