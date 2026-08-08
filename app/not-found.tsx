import type { Metadata } from "next";
import Link from "next/link";
import { ErrorHomeLink, ErrorPage } from "@/components/content/error-page";
import { NAV_CATEGORIES, jewelleryUrl } from "@/lib/navigation";

/**
 * 404 — Sazuna Error Pages.dc.html.
 *
 * This is the first styled 404 the rebuild has had: notFound() is already
 * called from the PDP, the confirmation page and the catalog, and every one of
 * them has been landing on Next's stock black-and-white page.
 *
 * Copy is the Express storefront's, which is better than the spec's demo text
 * because it says the true thing — a lot of these pieces are one-of-a-kind and
 * genuinely sell.
 */

export const metadata: Metadata = {
  title: "Page not found",
  description:
    "That page could not be found. Browse the Sazuna Jewellers collection or talk to us on WhatsApp.",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <ErrorPage
      code="Error 404"
      title="We can't find that page."
      blurb="Maybe it was a piece that sold — we make a lot of one-of-a-kinds — or maybe the link is a little off. Either way, here are some places to head next."
      icon="search"
      tone="notice"
      whatsappText="Hi, I was looking for something on your site and hit a dead end."
    >
      <div className="mt-7 flex flex-wrap justify-center gap-2.5">
        {NAV_CATEGORIES.slice(0, 6).map((category) => (
          <Link
            key={category.slug}
            href={jewelleryUrl(category.slug)}
            className="inline-flex items-center rounded-pill border border-line bg-raised px-4 text-sm font-semibold text-body no-underline min-h-11 hover:border-accent hover:text-primary-700 hover:no-underline"
          >
            {category.label}
          </Link>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <ErrorHomeLink />
        <Link
          href="/jewellery"
          className="inline-flex items-center justify-center rounded-[var(--sz-radius-control)] border border-line bg-raised px-6 text-control font-semibold text-primary-700 no-underline min-h-[52px] hover:border-primary-700 hover:no-underline"
        >
          Browse jewellery
        </Link>
      </div>
    </ErrorPage>
  );
}
