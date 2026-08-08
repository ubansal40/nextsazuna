import type { Metadata } from "next";
import { NotFoundView, notFoundMetadata } from "@/components/content/not-found-view";
import { StorefrontShell } from "@/components/shell/storefront-shell";

/**
 * The 404 for a URL that matches no route at all.
 *
 * This one is easy to lose. Next only consults the *root* `not-found.tsx` for
 * an unmatched URL — a `not-found.tsx` inside a route group is never reached,
 * because there is no matched segment to reach it through. Moving the storefront
 * into `(storefront)/` therefore silently regressed every mistyped URL back to
 * Next's stock black-and-white 404, with no header, no footer and no way back
 * into the shop. Verified in the browser, not assumed.
 *
 * So this boundary mounts the shell itself. That is not a second shell: the root
 * layout is only `<html>`/`<body>`, and `(storefront)/layout.tsx` is not in the
 * tree here, so `StorefrontShell` renders exactly once either way.
 *
 * When the admin grows its own 404, it goes in `(admin)/`, and an unmatched
 * `/admin/*` URL will still land here — which is correct, since an unmatched URL
 * is a public URL until proven otherwise, and this page reveals nothing.
 */

export const metadata: Metadata = notFoundMetadata;

export default function NotFound() {
  return (
    <StorefrontShell>
      <NotFoundView />
    </StorefrontShell>
  );
}
