import path from "node:path";
import type { NextConfig } from "next";
import { CONTENT_ROUTES } from "./lib/site-pages";

const nextConfig: NextConfig = {
  /**
   * Legacy `.html` URLs.
   *
   * Every content page on the Express storefront ended in `.html`, and those
   * URLs are in the live sitemap, in WhatsApp threads and on printed invoices.
   * Permanent redirects so none of it dead-ends at cutover.
   *
   * /returns.html moves to /exchange-resale rather than /returns: the promise
   * is a lifetime exchange and a buyback rate, not a return window, and the
   * footer has always named it that way.
   */
  async redirects() {
    return [
      ...CONTENT_ROUTES.filter((route) => route.legacy).map((route) => ({
        source: route.legacy!,
        destination: route.path,
        permanent: true,
      })),
      // The old app tracked orders in a second view of the receipt page.
      { source: "/order-success.html", destination: "/order-status", permanent: true },
    ];
  },

  /**
   * Pin the workspace root. Without this, Turbopack walks up looking for a
   * lockfile and can latch onto an unrelated one outside the repository.
   */
  turbopack: { root: path.resolve(import.meta.dirname) },

  /**
   * Fail the production build on type errors rather than shipping them. This is
   * Next's default; it is stated explicitly so nobody "fixes" a red build by
   * turning it off. Lint runs as its own CI step (`npm run lint`).
   */
  typescript: { ignoreBuildErrors: false },

  /**
   * `standalone` emits a self-contained server bundle with only the production
   * dependencies it actually traced. That is what makes deploying to Hostinger's
   * Node runner practical — no node_modules upload, far smaller artifact.
   */
  output: "standalone",

  /**
   * Product imagery is hosted on silveejewels.com (2,575 of 2,577 active
   * products). next/image refuses unlisted hosts by design, so this is required
   * rather than optional.
   *
   * Worth naming: the storefront's images depend on a separate site staying up.
   * That coupling is inherited from the Express app, not introduced here, but it
   * should move to storage this project controls before launch.
   */
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "silveejewels.com", pathname: "/wp-content/uploads/**" },
    ],
    formats: ["image/avif", "image/webp"],
  },

  poweredByHeader: false,
};

export default nextConfig;
