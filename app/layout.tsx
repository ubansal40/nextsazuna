import type { Metadata } from "next";
import { fontVariables } from "@/lib/fonts";
import { staticOrigin } from "@/lib/site-url";
import "./globals.css";

/**
 * The document, and nothing else.
 *
 * The storefront shell used to live here, which meant it also rendered over the
 * admin — a surface for a different audience entirely, which must not carry a
 * mega-menu, a mini-cart, or a customer session lookup. Both now live in sibling
 * route groups with their own layouts: `(storefront)` mounts the shell,
 * `(admin)` mounts its own.
 *
 * Route groups are erased from the URL, so nothing about the paths, the
 * redirects, the sitemap or ADR 0007's canonical jewellery URLs changed.
 *
 * This still honours the shared-shell rule rather than bending it: the rule is
 * that the shell is mounted once and that no *page* rebuilds it. A sibling
 * group has no storefront shell to rebuild. See docs/adr/0009.
 */

export const metadata: Metadata = {
  /**
   * Every page sets a relative `alternates.canonical`. Without a base, Next
   * emits them relative and logs a warning; with one, they resolve to absolute
   * URLs, which is what a canonical has to be to mean anything.
   */
  metadataBase: new URL(staticOrigin()),
  title: {
    default: "Sazuna Jewellers",
    template: "%s · Sazuna Jewellers",
  },
  description:
    "Certified diamond and gold jewellery. Every Sazuna diamond is graded by SGL and travels with its certificate.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
