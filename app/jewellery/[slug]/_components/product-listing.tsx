import Link from "next/link";
import { Chip, Icon, ProductCard } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ProductListing, SlugKind } from "@/lib/catalog";
import type { Facets } from "@/lib/catalog/facets";
import { clearAllUrl, toggleUrl, type FilterKey, type FilterState } from "@/lib/catalog/filter-params";
import { FilterSidebar, buildGroups } from "./filter-sidebar";
import { MobileToolbar } from "./mobile-toolbar";
import { SortLinks } from "./sort-links";

interface Props {
  heading: string;
  subheading?: string | null;
  kind: Exclude<SlugKind, "product">;
  basePath: string;
  listing: ProductListing;
  facets: Facets;
  state: FilterState;
  sort?: string;
  /** Products currently shown; "Load more" raises it. */
  shown: number;
  step: number;
}

const KIND_LABEL: Record<Exclude<SlugKind, "product">, string> = {
  category: "Category",
  tag: "Edit",
  collection: "Collection",
};

/**
 * Product listing page — spec §Sazuna Product Listing.
 *
 * Filter state lives in the URL and every control is a link, so the page is
 * fully functional server-rendered and without JavaScript. The only client
 * component is the mobile filter/sort sheet, which genuinely needs open state.
 */
export function ProductListingView({
  heading,
  subheading,
  kind,
  basePath,
  listing,
  facets,
  state,
  sort,
  shown,
  step,
}: Props) {
  const { products, total } = listing;
  const groups = buildGroups(facets);
  const extra = sort ? { sort } : {};

  // Flatten active selections into removable chips, labelled from the facets.
  const labelFor = (key: FilterKey, value: string) =>
    groups.find((g) => g.key === key)?.options.find((o) => o.value === value)?.label ?? value;

  const activeChips = (Object.keys(state) as FilterKey[]).flatMap((key) =>
    state[key].map((value) => ({ key, value, label: labelFor(key, value) })),
  );

  const hasMore = shown < total;

  return (
    <div className="mx-auto max-w-[var(--sz-container)] px-5 py-10 md:px-10">
      <nav aria-label="Breadcrumb" className="mb-5">
        <ol className="flex items-center gap-2 list-none p-0 m-0 text-xs text-muted">
          <li>
            <Link href="/" className="no-underline hover:text-primary-700">
              Home
            </Link>
          </li>
          <li aria-hidden="true">
            <Icon name="chevron-right" size={12} />
          </li>
          <li className="text-body">{heading}</li>
        </ol>
      </nav>

      <header className="mb-8 max-w-[68ch]">
        <div className="mb-3 flex items-center gap-2.5">
          <span aria-hidden="true" className="size-2 rotate-45 bg-accent" />
          <span className="font-mono text-2xs uppercase tracking-[var(--sz-tracking-caps)] text-primary-700">
            {KIND_LABEL[kind]}
          </span>
        </div>
        <h1 className="text-[length:var(--sz-text-page-title-sm)] tracking-[var(--sz-tracking-tight)] md:text-[length:var(--sz-text-page-title)]">
          {heading}
        </h1>
        {subheading && (
          <p className="mt-4 text-base leading-[var(--sz-leading-relaxed)] text-body">
            {subheading}
          </p>
        )}
      </header>

      <div className="grid items-start gap-10 lg:grid-cols-[var(--sz-plp-sidebar)_minmax(0,1fr)]">
        <FilterSidebar facets={facets} state={state} basePath={basePath} sort={sort} />

        <div className="min-w-0">
          {/* Desktop toolbar */}
          <div className="mb-6 hidden flex-wrap items-center justify-between gap-4 border-y border-line py-3.5 lg:flex">
            <p className="text-sm text-muted">
              <span className="font-mono tabular-nums text-body">
                {total.toLocaleString("en-IN")}
              </span>{" "}
              {total === 1 ? "piece" : "pieces"}
            </p>
            <SortLinks basePath={basePath} state={state} current={sort ?? "popularity"} />
          </div>

          {/* Mobile toolbar — opens the filter and sort sheets */}
          <MobileToolbar
            total={total}
            activeCount={activeChips.length}
            basePath={basePath}
            state={state}
            sort={sort}
            facets={facets}
          />

          {activeChips.length > 0 && (
            <div className="mb-6 flex flex-wrap items-center gap-2.5">
              {activeChips.map((chip) => (
                <Link
                  key={`${chip.key}:${chip.value}`}
                  href={toggleUrl(basePath, state, chip.key, chip.value, extra)}
                  scroll={false}
                  className="no-underline hover:no-underline"
                  aria-label={`Remove filter ${chip.label}`}
                >
                  <Chip>
                    {chip.label}
                    <Icon name="close" size={13} />
                  </Chip>
                </Link>
              ))}
              <Link
                href={clearAllUrl(basePath, extra)}
                className="text-xs font-semibold text-primary-700 no-underline hover:underline"
              >
                Clear all
              </Link>
            </div>
          )}

          {products.length === 0 ? (
            <EmptyState basePath={basePath} extra={extra} filtered={activeChips.length > 0} />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-3 gap-y-5 md:gap-x-[22px] md:gap-y-7 xl:grid-cols-3">
                {products.map((product) => (
                  <ProductCard
                    key={product.id}
                    title={product.name}
                    href={product.href}
                    price={product.price}
                    compareAtPrice={product.compareAtPrice ?? undefined}
                    image={
                      product.imageUrl ? { src: product.imageUrl, alt: product.name } : undefined
                    }
                    outOfStock={!product.inStock}
                    certified
                  />
                ))}
              </div>

              {hasMore && (
                <div className="mt-12 flex flex-col items-center gap-3 border-t border-line pt-10">
                  <p className="font-mono text-2xs tabular-nums text-muted">
                    Showing {products.length.toLocaleString("en-IN")} of{" "}
                    {total.toLocaleString("en-IN")}
                  </p>
                  <Link
                    href={buildShowUrl(basePath, state, sort, shown + step)}
                    scroll={false}
                    className={cn(
                      "inline-flex items-center justify-center gap-2 rounded-[var(--sz-radius-btn-lg)] border px-[26px] py-[14px]",
                      "border-primary-700 text-base font-semibold text-primary-700 no-underline",
                      "transition-colors duration-[var(--sz-dur)] ease-[var(--sz-ease-out)]",
                      "hover:bg-primary-50 hover:no-underline",
                    )}
                  >
                    Load more
                    <Icon name="chevron-down" size={18} />
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** "Load more" is a link, so the expanded view is shareable and needs no JS. */
function buildShowUrl(
  basePath: string,
  state: FilterState,
  sort: string | undefined,
  show: number,
): string {
  const params = new URLSearchParams();
  for (const [key, values] of Object.entries(state)) {
    if (values.length) params.set(key, values.join(","));
  }
  if (sort) params.set("sort", sort);
  params.set("show", String(show));
  return `${basePath}?${params.toString()}`;
}

function EmptyState({
  basePath,
  extra,
  filtered,
}: {
  basePath: string;
  extra: Record<string, string | undefined>;
  filtered: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-[var(--sz-radius-lg)] border border-line bg-raised px-6 py-20 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-[var(--sz-radius-pill)] bg-surface text-muted">
        <Icon name="search" size={24} />
      </span>
      <h2 className="text-lg">No pieces match these filters</h2>
      <p className="max-w-[46ch] text-sm leading-[var(--sz-leading-relaxed)] text-muted">
        Try removing a filter — or tell us what you&rsquo;re looking for and we&rsquo;ll find it in
        the atelier.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        {filtered && (
          <Link
            href={clearAllUrl(basePath, extra)}
            className={cn(
              "inline-flex items-center rounded-[var(--sz-radius-control)] bg-primary-700 px-[20px] py-[11px]",
              "text-[length:var(--sz-text-control)] font-semibold text-white no-underline",
              "transition-colors duration-[var(--sz-dur)] hover:bg-primary-800 hover:no-underline",
            )}
          >
            Clear filters
          </Link>
        )}
        <a
          href="https://wa.me/9779800000000"
          target="_blank"
          rel="noreferrer noopener"
          className={cn(
            "inline-flex items-center gap-2 rounded-[var(--sz-radius-control)] border border-primary-700 px-[20px] py-[11px]",
            "text-[length:var(--sz-text-control)] font-semibold text-primary-700 no-underline",
            "transition-colors duration-[var(--sz-dur)] hover:bg-primary-50 hover:no-underline",
          )}
        >
          <Icon name="whatsapp" size={18} />
          WhatsApp us
        </a>
      </div>
    </div>
  );
}
