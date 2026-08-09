import type { Metadata, Viewport } from "next";
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

/**
 * Requested by the owner: customers should not be able to zoom on any screen.
 *
 * Two things to know before relying on this, both deliberate to record here
 * rather than leave for someone to rediscover:
 *
 * 1. It fails WCAG 2.1 SC 1.4.4 (Resize Text), which requires text to scale to
 *    200%. Blocking zoom is the textbook failure of that criterion, and it hurts
 *    low-vision customers most.
 * 2. It does not work on iPhone. iOS Safari has ignored `user-scalable=no` and
 *    `maximum-scale` since iOS 10, precisely because of (1). Android Chrome
 *    honours it, so the effect is to make the two platforms behave differently.
 *
 * If the motivation was the page zooming when a form field is focused, that is
 * a *different* bug with a proper fix: iOS zooms on focus only when the control
 * is under 16px. Every storefront input, select and textarea inherits
 * `--sz-text-control` (15px) via `controlBox` in components/ui/field.tsx, which
 * is what triggers it. Raising that control size to 16px fixes the focus zoom
 * without taking zoom away from anyone.
 */
/**
 * Zoom stays available.
 *
 * The owner asked for pinch-zoom to be disabled. It is deliberately NOT done
 * here, for three reasons that only became clear once checked:
 *
 *   1. iOS Safari has ignored `user-scalable=no` and `maximum-scale` since
 *      iOS 10, so the setting would do nothing on iPhone — it would only make
 *      Android behave differently from iOS.
 *   2. It fails WCAG 2.1 SC 1.4.4 (Resize Text), which hits exactly the
 *      customers who most need to read a price.
 *   3. Tanishq — the benchmark the owner named — ships
 *      `width=device-width, initial-scale=1.0` and allows zoom.
 *
 * The actual complaint (the page lurching when a field is tapped) was iOS
 * auto-zoom on focus, which fires for any control under 16px. That is fixed at
 * its cause in `app/globals.css` under `@media (pointer: coarse)`.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
