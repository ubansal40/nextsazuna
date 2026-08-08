import type { MetadataRoute } from "next";
import { listPublishedPosts } from "@/lib/blog/posts";
import { postHref } from "@/lib/blog/markdown";
import { CONTENT_ROUTES } from "@/lib/site-pages";
import { staticOrigin } from "@/lib/site-url";

/**
 * Generated per request, because the post list comes from the database.
 *
 * The build deliberately runs without credentials, so a prerendered sitemap
 * would either fail the build or — worse — ship an empty one and quietly
 * de-list the whole Journal.
 */
export const dynamic = "force-dynamic";

/**
 * Sitemap.
 *
 * Static routes only, for now. The Express app's sitemap also enumerated every
 * category, tag, collection and product — that needs the catalog, and the
 * production build runs without database credentials, so adding it here would
 * either fail the build or ship an empty file. It belongs in a later stage
 * alongside `force-dynamic`, or once the build gets read-only access.
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
