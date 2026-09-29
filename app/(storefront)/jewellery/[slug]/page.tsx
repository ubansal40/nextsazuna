import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import {
  getProductBySlug,
  jewelleryHref,
  listProducts,
  resolveSlug,
  slugFromSegment,
  storedSlug,
  type SortKey,
} from "@/lib/catalog";
import { bracketById, getFacets } from "@/lib/catalog/facets";
import { readFilters, type RawParams, readSort } from "@/lib/catalog/filter-params";
import { getCategoryIntro, getWhatsAppHref } from "@/lib/content";
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
 * The spec's logic uses 9, sized to its 24-item demo catalog. 12 divides evenly
 * into both the 2- and 3-column grids (six rows and four), so a batch never
 * leaves a ragged final row — the same property 24 had, at half the first
 * paint. The other three listing surfaces use the same number; they render the
 * identical grid, and two of them differing would read as a bug.
 */
const STEP = 12;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** The query string as it arrived, repeated keys and all, for a redirect. */
function withQuery(path: string, q: RawParams): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(q)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      query.append(key, item);
    }
  }
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const slug = slugFromSegment((await params).slug);
  if (!slug) return {};

  const resolved = await resolveSlug(slug);
  if (!resolved) return {};

  // From the stored slug, never the typed one — see the redirect below.
  const canonical = jewelleryHref(storedSlug(resolved));

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

  /**
   * One URL per page (ADR 0007). Slugs compare case- and accent-insensitively
   * in the database, so /jewellery/RINGS.html and /jewellery/Aurora-Diamond-Ring.html
   * found their page — and served it, with themselves as the canonical, as a
   * duplicate of the real URL. Anything but the stored spelling now moves there
   * permanently, filters and sort intact.
   */
  const canonicalSlug = storedSlug(resolved);
  if (slug !== canonicalSlug) {
    permanentRedirect(withQuery(jewelleryHref(canonicalSlug), await searchParams));
  }

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

  // The page's own scope. The listing and its facet counts both take exactly
  // this, so every option the sidebar offers returns something.
  const scope = {
    categorySlug,
    tagSlugs: tagSlug ? [tagSlug] : undefined,
    collectionIds: collectionId ? [collectionId] : undefined,
  };

  // The admin's description ("shown on the storefront listing page") wins; the
  // older `category_intros` block still covers categories that have none.
  const description =
    resolved.kind === "category" ? resolved.category.description?.trim() || null : null;

  const [listing, facets, intro, whatsappHref] = await Promise.all([
    listProducts({
      ...scope,
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
    getFacets(scope),
    categorySlug && !description ? getCategoryIntro(categorySlug) : Promise.resolve(null),
    getWhatsAppHref(),
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
      subheading={description ?? intro}
      basePath={jewelleryHref(canonicalSlug)}
      listing={listing}
      facets={facets}
      state={filters}
      sort={sort}
      pageSize={STEP}
      whatsappHref={whatsappHref}
      request={{ categorySlug, tagSlug, collectionId, filters, sort }}
    />
  );
}
