import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProductBySlug, listProducts, resolveSlug, slugFromSegment } from "@/lib/catalog";
import { bracketById, getFacets } from "@/lib/catalog/facets";
import { readFilters, type RawParams } from "@/lib/catalog/filter-params";
import { ProductDetailView } from "./_components/product-detail";
import { ProductListingView } from "./_components/product-listing";
import { SORT_VALUES } from "./_components/sort-links";
import type { SortKey } from "@/lib/catalog";

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
 * Products shown initially, and added per "Load more".
 *
 * The spec's own logic uses 9, but that is sized to its 24-item demo catalog.
 * Real categories run to several hundred, where 9 would mean dozens of clicks.
 * 24 keeps the spec's load-more pattern while staying a multiple of both the
 * 2- and 3-column grids.
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
      openGraph: {
        title: product.name,
        type: "website",
        images: product.imageUrl ? [{ url: product.imageUrl }] : undefined,
      },
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

  const sortRaw = one(q.sort);
  const sort = sortRaw && SORT_VALUES.has(sortRaw as "popularity") ? sortRaw : undefined;

  // "Load more" accumulates by raising `show`, so the expanded list stays a
  // real, shareable URL rather than client-only state.
  const showRaw = Number(one(q.show));
  const shown =
    Number.isFinite(showRaw) && showRaw > 0 ? Math.min(240, Math.ceil(showRaw / STEP) * STEP) : STEP;

  const categorySlug = resolved.kind === "category" ? resolved.category.slug : undefined;

  const [listing, facets] = await Promise.all([
    listProducts({
      categorySlug,
      tagSlugs: resolved.kind === "tag" ? [resolved.tag.slug] : undefined,
      collectionIds: resolved.kind === "collection" ? [resolved.collection.id] : undefined,
      categorySlugs: filters.cat.length ? filters.cat : undefined,
      collectionSlugs: filters.collection.length ? filters.collection : undefined,
      material: filters.material.length ? filters.material : undefined,
      purity: filters.purity.length ? filters.purity : undefined,
      priceBrackets: filters.price.length
        ? filters.price.map(bracketById).filter((b) => b !== null)
        : undefined,
      sort: sort as SortKey | undefined,
      page: 1,
      pageSize: shown,
    }),
    getFacets({ categorySlug }),
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
      kind={resolved.kind}
      basePath={`/jewellery/${slug}.html`}
      listing={listing}
      facets={facets}
      state={filters}
      sort={sort}
      shown={shown}
      step={STEP}
    />
  );
}
