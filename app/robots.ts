import type { MetadataRoute } from "next";
import { staticOrigin } from "@/lib/site-url";

/**
 * robots.txt, ported from the Express app's generated one.
 *
 * The disallow list is the same, with one deliberate difference:
 * /order-success.html was disallowed there, and the guest order tracker lived
 * at /order-success.html#track — so the tracker was blocked along with it.
 * /order-status is its own route here and is crawlable.
 *
 * Personal surfaces stay out: a cart, a checkout and a receipt are per-visitor
 * and rank for nothing.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/api/", "/account/", "/checkout", "/cart", "/search"],
    },
    sitemap: `${staticOrigin()}/sitemap.xml`,
  };
}
