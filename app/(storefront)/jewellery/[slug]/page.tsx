import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getProductBySlug,
  listProducts,
  resolveSlug,
  slugFromSegment,
  type SortKey,
} from "@/lib/catalog";
import { bracketById, getFacets } from "@/lib/catalog/facets";
import { readFilters, type RawParams, readSort } from "@/lib/catalog/filter-params";
import { getCategoryIntro } from "@/lib/content";
import { ProductDetailView } from "./_components/product-detail";
import { ProductListingView } from "./_components/product-listing";

/**
 * The canonical storefront URL: /jewellery/{slug}.html
 *
 * One dispatcher serves categories, tags, collections and products, exactly as
 * the Express app did (ADR 0007). The `.html` suffix is preserved because these
 * URLs are indexed; the route segment arrives as "solitaire-ring.html" and the
 * suffix is stripped here.
 */

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawParams>;
}

/**
 * Batch size for the first render and each infinite-scroll page.
 *
 * The spec's logic uses 9, sized to its 24-item demo catalog. Real categories
 * run to several hundred, and 24 divides evenly into both the 2- and 3-column
 * grids so a batch never leaves a ragged final row.
 */
const STEP = 24;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const slug = slugFromSegment((await params).slug);
  if (!slug) return {};

  const resolved = await resolveSlug(slug);
  if (!resolved) return {};

  const canonical = `/jewellery/${slug}.html`;

  if (resolved.kind === "product") {
    const product = await getProductBySlug(resolved.slug);
    if (!product) return {};
    return {
      title: product.name,
      description:
        product.description?.slice(0, 160) ??
        `${product.name} — certified jewellery from Sazuna Jewellers.`,
      alternates: { canonical },
      // No `openGraph` block on purpose. Next has no "product" in its OpenGraph
      // type union and emits `other` entries as <meta name>, which OG scrapers
      // ignore — they read `property`. ProductDetailView renders the whole OG
      // set itself; declaring any of it here would duplicate og:type.
    };
  }

  const name =
    resolved.kind === "category"
      ? resolved.category.name
      : resolved.kind === "tag"
        ? resolved.tag.name
        : resolved.collection.name;

  return {
    title: name,
    description: `${name} — certified diamond and gold jewellery from Sazuna Jewellers.`,
    alternates: { canonical },
  };
}

export default async function JewelleryPage({ params, searchParams }: PageProps) {
  const slug = slugFromSegment((await params).slug);
  if (!slug) notFound();

  const resolved = await resolveSlug(slug);
  if (!resolved) notFound();

  if (resolved.kind === "product") {
    const product = await getProductBySlug(resolved.slug);
    if (!product) notFound();
    return <ProductDetailView product={product} />;
  }

  const q = await searchParams;
  const filters = readFilters(q);

  const sort = readSort(one(q.sort));

  const categorySlug = resolved.kind === "category" ? resolved.category.slug : undefined;
  const tagSlug = resolved.kind === "tag" ? resolved.tag.slug : undefined;
  const collectionId = resolved.kind === "collection" ? resolved.collection.id : undefined;

  const [listing, facets, intro] = await Promise.all([
    listProducts({
      categorySlug,
      tagSlugs: tagSlug ? [tagSlug] : undefined,
      collectionIds: collectionId ? [collectionId] : undefined,
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
    getFacets({ categorySlug }),
    categorySlug ? getCategoryIntro(categorySlug) : Promise.resolve(null),
  ]);

  const heading =
    resolved.kind === "category"
      ? resolved.category.name
      : resolved.kind === "tag"
        ? resolved.tag.name
        : resolved.collection.name;

  return (
    <ProductListingView
      heading={heading}
      subheading={intro}
      basePath={`/jewellery/${slug}.html`}
      listing={listing}
      facets={facets}
      state={filters}
      sort={sort}
      pageSize={STEP}
      request={{ categorySlug, tagSlug, collectionId, filters, sort }}
    />
  );
}
