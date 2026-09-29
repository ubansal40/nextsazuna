import type { MetadataRoute } from "next";
import { listPublishedPosts } from "@/lib/blog/posts";
import { postHref } from "@/lib/blog/markdown";
import { jewelleryHref, listCatalogUrls, type CatalogUrl } from "@/lib/catalog";
import { CONTENT_ROUTES } from "@/lib/site-pages";
import { staticOrigin } from "@/lib/site-url";

/**
 * Generated per request, because the post list and the catalog come from the
 * database.
 *
 * The build deliberately runs without credentials, so a prerendered sitemap
 * would either fail the build or — worse — ship an empty one and quietly
 * de-list the whole Journal and catalog.
 */
export const dynamic = "force-dynamic";

/**
 * Catalog weights. Listings rank above the pieces in them: a category page is
 * where a broad search should land, and it is what links on to every product.
 */
const CATALOG_WEIGHT: Record<
  CatalogUrl["kind"],
  { priority: number; changeFrequency: "daily" | "weekly" }
> = {
  category: { priority: 0.8, changeFrequency: "daily" },
  collection: { priority: 0.7, changeFrequency: "weekly" },
  tag: { priority: 0.6, changeFrequency: "weekly" },
  product: { priority: 0.7, changeFrequency: "weekly" },
};

/**
 * Sitemap.
 *
 * The static routes, the Journal, and every live catalog page — each visible
 * category and tag, active collection and active product at its canonical
 * `/jewellery/{slug}.html` URL (ADR 0007), as the Express app's sitemap listed
 * them. "Live" is decided by the same predicates `resolveSlug` uses, so nothing
 * is listed that would 404.
 *
 * Nothing carrying `noindex` appears. A sitemap entry for a noindexed URL is a
 * contradiction Search Console reports, and it is one the old app shipped for
 * /privacy.html and /terms.html.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = staticOrigin();
  const lastModified = new Date();

  /**
   * A database hiccup should cost the sitemap its posts, not return a 500 to a
   * crawler — an error here is read as "the sitemap is gone", which is worse
   * than one that is briefly short.
   */
  let posts: { slug: string; published_at: string | null }[] = [];
  try {
    posts = await listPublishedPosts();
  } catch (error) {
    console.warn("[sitemap] the Journal is unavailable; listing static routes only", error);
  }

  // The catalog on the same terms: a failure drops these entries, nothing else.
  let catalog: CatalogUrl[] = [];
  try {
    catalog = await listCatalogUrls();
  } catch (error) {
    console.warn("[sitemap] the catalog is unavailable; listing without it", error);
  }

  return [
    { url: origin, lastModified, changeFrequency: "daily" as const, priority: 1 },
    {
      url: `${origin}/jewellery`,
      lastModified,
      changeFrequency: "daily" as const,
      priority: 0.95,
    },
    ...CONTENT_ROUTES.filter((route) => route.indexable).map((route) => ({
      url: `${origin}${route.path}`,
      lastModified,
      changeFrequency: route.changeFrequency,
      priority: route.priority,
    })),
    // `lastmod` is the row's last edit rather than today, for the reason given
    // for posts below.
    ...catalog.map((entry) => ({
      url: `${origin}${jewelleryHref(entry.slug)}`,
      lastModified: new Date(entry.updatedAt),
      ...CATALOG_WEIGHT[entry.kind],
    })),
    // Long-form, low churn — the same priority the Express sitemap gave them.
    // `lastmod` is the publish date rather than today, so a crawler is not told
    // every post changed whenever the sitemap is regenerated.
    ...posts.map((post) => ({
      url: `${origin}${postHref(post.slug)}`,
      lastModified: post.published_at ? new Date(post.published_at) : lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
