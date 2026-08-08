import type { Metadata } from "next";
import { NotFoundView, notFoundMetadata } from "@/components/content/not-found-view";

/**
 * The 404 for `notFound()` called inside a storefront route — the PDP, the
 * catalog, the confirmation page.
 *
 * It draws no chrome: this boundary sits below `(storefront)/layout.tsx`, so
 * the shell is already around it. The sibling at `app/not-found.tsx` is the one
 * that has to mount the shell itself.
 */

export const metadata: Metadata = notFoundMetadata;

export default function NotFound() {
  return <NotFoundView />;
}
