import { StorefrontShell } from "@/components/shell/storefront-shell";

/**
 * Every customer-facing route.
 *
 * MANDATORY SHARED SHELL. No page below this may render its own header, footer,
 * announcement bar, mega-menu, mini-cart or WhatsApp button.
 *
 * It sits in a route group rather than at the document root so the admin — a
 * different audience — does not inherit it, nor its three reads, one of which
 * is a customer session lookup that would be meaningless there. Route groups
 * are erased from the URL, so nothing about the paths changed.
 */
export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return <StorefrontShell>{children}</StorefrontShell>;
}
