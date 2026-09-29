import Link from "next/link";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ProductListing } from "@/lib/catalog";
import type { Facets } from "@/lib/catalog/facets";
import { clearAllUrl, type FilterState } from "@/lib/catalog/filter-params";
import { FilterSidebar } from "./filter-sidebar";
import { InfiniteGrid } from "./infinite-grid";
import { Toolbar } from "./toolbar";
import type { LoadMoreInput } from "./actions";

interface Props {
  heading: string;
  subheading?: string | null;
  basePath: string;
  listing: ProductListing;
  facets: Facets;
  state: FilterState;
  sort: string;
  pageSize: number;
  /** From `getWhatsAppHref()`; null when no number is configured. */
  whatsappHref: string | null;
  request: Omit<LoadMoreInput, "page" | "pageSize">;
}

/**
 * Product listing page — spec §Sazuna Product Listing.
 *
 * Structure follows the spec exactly: a listing header, then a full-bleed
 * sticky toolbar, then the sidebar + grid body. Filter state lives in the URL
 * and every filter control is a link, so filtering and sorting work without
 * JavaScript; only the sort select, the mobile sheets and infinite scroll are
 * client-side.
 */
export function ProductListingView({
  heading,
  subheading,
  basePath,
  listing,
  facets,
  state,
  sort,
  pageSize,
  whatsappHref,
  request,
}: Props) {
  const { products, total } = listing;
  const countLabel = `${total.toLocaleString("en-IN")} ${total === 1 ? "piece" : "pieces"}`;
  const activeCount = Object.values(state).reduce((n, values) => n + values.length, 0);
  const extra = sort !== "popularity" ? { sort } : {};

  return (
    <>
      <section className="pt-[22px]">
        <div className="mx-auto max-w-[var(--sz-container)] px-5 md:px-10">
          <div className="mt-2 max-w-[680px]">
            <h1
              className={cn(
                "font-[family-name:var(--sz-font-display)] font-normal text-heading",
                "text-[length:var(--sz-text-page-title-sm)] md:text-[length:var(--sz-text-page-title)]",
                "leading-[1.05] tracking-[var(--sz-tracking-tight)]",
              )}
            >
              {heading}
            </h1>
            {subheading && (
              <p className="mt-3 text-[15px] leading-[1.6] text-muted text-pretty">{subheading}</p>
            )}
          </div>
        </div>
      </section>

      <Toolbar
        countLabel={countLabel}
        basePath={basePath}
        state={state}
        sort={sort}
        facets={facets}
      />

      <section className="mt-7">
        <div className="mx-auto max-w-[var(--sz-container)] px-5 md:px-10">
          <div className="grid items-start gap-10 lg:grid-cols-[var(--sz-plp-sidebar)_minmax(0,1fr)]">
            <FilterSidebar facets={facets} state={state} basePath={basePath} sort={sort} />

            {/* Pinned to the second track. The sidebar renders nothing when no
                group has an option — a search with no results, an empty
                category — and an unplaced grid item then fell into the first
                track, squeezing the results into the 256px sidebar slot. */}
            <div className="min-w-0 lg:col-start-2">
              {products.length === 0 ? (
                <EmptyState
                  basePath={basePath}
                  extra={extra}
                  filtered={activeCount > 0}
                  searched={Boolean(request.search)}
                  whatsappHref={whatsappHref}
                />
              ) : (
                <InfiniteGrid
                  // Remount on any filter or sort change so the accumulated
                  // list resets cleanly instead of appending to stale results.
                  key={`${JSON.stringify(state)}|${sort}`}
                  initial={products}
                  total={total}
                  pageSize={pageSize}
                  request={request}
                />
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

/**
 * Nothing to show — and the copy says why. "No pieces match these filters"
 * used to be the only wording, so an empty category or a search that found
 * nothing blamed filters the customer had never set.
 */
function EmptyState({
  basePath,
  extra,
  filtered,
  searched,
  whatsappHref,
}: {
  basePath: string;
  extra: Record<string, string | undefined>;
  filtered: boolean;
  searched: boolean;
  whatsappHref: string | null;
}) {
  const [title, suggestion] = filtered
    ? ["No pieces match these filters", "Try removing a filter"]
    : searched
      ? ["No pieces match your search", "Try another word, or a SKU"]
      : ["No pieces here yet", "New pieces are added regularly"];

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-[var(--sz-radius-lg)] border border-line bg-raised px-6 py-20 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-[var(--sz-radius-pill)] bg-surface text-muted">
        <Icon name="search" size={24} />
      </span>
      <h2 className="text-lg">{title}</h2>
      <p className="max-w-[46ch] text-sm leading-[var(--sz-leading-relaxed)] text-muted">
        {/* The atelier offer only stands when there is a way to take it up. */}
        {whatsappHref ? (
          <>
            {suggestion} — or tell us what you&rsquo;re looking for and we&rsquo;ll find it in the
            atelier.
          </>
        ) : (
          `${suggestion}.`
        )}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        {filtered && (
          <Link
            href={clearAllUrl(basePath, extra)}
            className={cn(
              "inline-flex items-center rounded-[var(--sz-radius-control)] bg-primary-700 px-5 py-[11px]",
              "text-[length:var(--sz-text-control)] font-semibold text-white no-underline",
              "transition-colors duration-[var(--sz-dur)] hover:bg-primary-800 hover:no-underline",
            )}
          >
            Clear filters
          </Link>
        )}
        {/* The shop's own number from site_identity. This used to be a
            hardcoded placeholder, wa.me/9779800000000, which reaches no one. */}
        {whatsappHref && (
          <a
            href={whatsappHref}
            target="_blank"
            rel="noreferrer noopener"
            className={cn(
              "inline-flex items-center gap-2 rounded-[var(--sz-radius-control)] border border-primary-700 px-5 py-[11px]",
              "text-[length:var(--sz-text-control)] font-semibold text-primary-700 no-underline",
              "transition-colors duration-[var(--sz-dur)] hover:bg-primary-50 hover:no-underline",
            )}
          >
            <Icon name="whatsapp" size={18} />
            WhatsApp us
          </a>
        )}
      </div>
    </div>
  );
}
