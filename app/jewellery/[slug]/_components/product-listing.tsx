import Link from "next/link";
import { Icon, ProductCard } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ProductListing, SlugKind } from "@/lib/catalog";
import { SortSelect } from "./sort-select";

interface Props {
  heading: string;
  kind: Exclude<SlugKind, "product">;
  basePath: string;
  listing: ProductListing;
}

const KIND_LABEL: Record<Exclude<SlugKind, "product">, string> = {
  category: "Category",
  tag: "Edit",
  collection: "Collection",
};

/**
 * Product listing page — categories, tags and collections all render through
 * here. Composed entirely from design-system primitives; no bespoke styling.
 */
export function ProductListingView({ heading, kind, basePath, listing }: Props) {
  const { products, total, page, totalPages } = listing;

  return (
    <div className="mx-auto max-w-[var(--sz-container)] px-6 py-12 md:px-10">
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

      <header className="mb-8">
        <div className="mb-3 flex items-center gap-2.5">
          <span aria-hidden="true" className="size-2 rotate-45 bg-accent" />
          <span className="font-mono text-2xs uppercase tracking-[var(--sz-tracking-caps)] text-primary-700">
            {KIND_LABEL[kind]}
          </span>
        </div>
        <h1 className="text-2xl tracking-[-.01em]">{heading}</h1>
      </header>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-y border-line py-3.5">
        <p className="text-sm text-muted">
          <span className="font-mono tabular-nums text-body">{total.toLocaleString("en-IN")}</span>{" "}
          {total === 1 ? "piece" : "pieces"}
        </p>
        <SortSelect basePath={basePath} />
      </div>

      {products.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-[var(--sz-radius-lg)] border border-line bg-raised py-20 text-center">
          <span className="inline-flex size-14 items-center justify-center rounded-[var(--sz-radius-pill)] bg-surface text-muted">
            <Icon name="search" size={24} />
          </span>
          <p className="text-sm text-muted">Nothing here yet.</p>
          <Link
            href="/"
            className="text-sm font-semibold text-primary-700 no-underline hover:underline"
          >
            Browse everything →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              title={product.name}
              href={product.href}
              price={product.price}
              compareAtPrice={product.compareAtPrice ?? undefined}
              image={product.imageUrl ? { src: product.imageUrl, alt: product.name } : undefined}
              outOfStock={!product.inStock}
              certified
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <nav
          aria-label="Pagination"
          className="mt-12 flex items-center justify-center gap-2 border-t border-line pt-8"
        >
          <PageLink basePath={basePath} page={page - 1} disabled={page <= 1} label="Previous">
            <Icon name="chevron-left" size={16} />
            Previous
          </PageLink>
          <span className="px-4 font-mono text-xs tabular-nums text-muted">
            {page} / {totalPages}
          </span>
          <PageLink basePath={basePath} page={page + 1} disabled={page >= totalPages} label="Next">
            Next
            <Icon name="chevron-right" size={16} />
          </PageLink>
        </nav>
      )}
    </div>
  );
}

function PageLink({
  basePath,
  page,
  disabled,
  label,
  children,
}: {
  basePath: string;
  page: number;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const className = cn(
    "inline-flex items-center gap-1.5 rounded-[var(--sz-radius-control)] border px-4 py-2.5 text-sm font-semibold no-underline",
    "transition-colors duration-[var(--sz-dur)] ease-[var(--sz-ease-out)]",
    disabled
      ? "cursor-not-allowed border-line text-muted opacity-[var(--sz-disabled-opacity)]"
      : "border-primary-700 text-primary-700 hover:bg-primary-50 hover:no-underline",
  );

  // A disabled control must not be a link: nothing to focus, nothing to crawl.
  if (disabled) {
    return (
      <span aria-disabled="true" className={className}>
        {children}
      </span>
    );
  }

  return (
    <Link href={`${basePath}?page=${page}`} rel={label === "Next" ? "next" : "prev"} className={className}>
      {children}
    </Link>
  );
}
