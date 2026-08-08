import type { MetadataRoute } from "next";
import { CONTENT_ROUTES } from "@/lib/site-pages";
import { staticOrigin } from "@/lib/site-url";

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
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = staticOrigin();
  const lastModified = new Date();

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
  ];
}
