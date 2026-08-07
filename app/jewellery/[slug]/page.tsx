import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProductBySlug, listProducts, resolveSlug, slugFromSegment } from "@/lib/catalog";
import { ProductDetailView } from "./_components/product-detail";
import { ProductListingView } from "./_components/product-listing";

/**
 * The canonical storefront URL: /jewellery/{slug}.html
 *
 * One dispatcher serves categories, tags, collections and products, exactly as
 * the Express app did (ADR 0007). The `.html` suffix is preserved because these
 * URLs are indexed; the route segment simply arrives as "solitaire-ring.html"
 * and the suffix is stripped here.
 *
 * Rendered dynamically rather than statically: with ~3,100 products, prebuilding
 * every page would make each deploy long and stale-prone on shared hosting.
 * Next's route cache handles repeat traffic.
 */

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Read a single value from a query param that may legitimately repeat. */
function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function csv(value: string | string[] | undefined): string[] | undefined {
  const raw = one(value);
  if (!raw) return undefined;
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
}

function positiveInt(value: string | string[] | undefined): number | undefined {
  const raw = one(value);
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

const SORTS = new Set(["popularity", "price-asc", "price-desc", "newest"]);

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
  const segment = (await params).slug;
  const slug = slugFromSegment(segment);
  if (!slug) notFound();

  const resolved = await resolveSlug(slug);
  if (!resolved) notFound();

  if (resolved.kind === "product") {
    const product = await getProductBySlug(resolved.slug);
    if (!product) notFound();
    return <ProductDetailView product={product} />;
  }

  const q = await searchParams;
  const sortRaw = one(q.sort);

  const listing = await listProducts({
    categorySlug: resolved.kind === "category" ? resolved.category.slug : undefined,
    tagSlugs: resolved.kind === "tag" ? [resolved.tag.slug] : csv(q.tags),
    collectionIds: resolved.kind === "collection" ? [resolved.collection.id] : undefined,
    minPrice: positiveInt(q.min),
    maxPrice: positiveInt(q.max),
    purity: csv(q.purity),
    stoneType: csv(q.stone),
    sort: sortRaw && SORTS.has(sortRaw) ? (sortRaw as "popularity") : undefined,
    page: positiveInt(q.page) ?? 1,
  });

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
    />
  );
}
