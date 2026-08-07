import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

  poweredByHeader: false,
};

export default nextConfig;
