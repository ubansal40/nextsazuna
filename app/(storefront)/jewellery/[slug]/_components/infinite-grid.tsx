"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ProductCard, Skeleton } from "@/components/ui";
import type { ProductSummary } from "@/lib/catalog";
import { loadMoreProducts, type LoadMoreInput } from "./actions";

interface Props {
  initial: ProductSummary[];
  total: number;
  pageSize: number;
  request: Omit<LoadMoreInput, "page" | "pageSize">;
}

/**
 * Product grid with infinite scroll — spec §Product grid.
 *
 * The spec loads the next batch when the viewport comes within 640px of the
 * document end, and restores scroll position when returning from a product.
 * Both are reproduced here.
 *
 * A sentinel with IntersectionObserver is used rather than a scroll handler:
 * it does the same job without running work on every scroll frame, and it
 * stops firing automatically once the list is exhausted.
 */
export function InfiniteGrid({ initial, total, pageSize, request }: Props) {
  const [products, setProducts] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const page = useRef(1);

  // Note: no effect resets this state when filters change. The parent passes a
  // `key` derived from the active filters and sort, so a change remounts this
  // component with fresh state — React's own answer to "reset on prop change",
  // and it avoids an extra render pass.

  const hasMore = products.length < total;

  const loadMore = useCallback(async () => {
    if (loading || failed) return;
    setLoading(true);
    try {
      const next = await loadMoreProducts({ ...request, page: page.current + 1, pageSize });
      page.current += 1;
      // Guard against a double-fire appending the same page twice.
      setProducts((current) => {
        const seen = new Set(current.map((p) => p.id));
        return [...current, ...next.filter((p) => !seen.has(p.id))];
      });
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [loading, failed, request, pageSize]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      // Matches the spec's 640px lead-in, so the next batch is already arriving
      // by the time the customer reaches the end of the current one.
      { rootMargin: "640px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  // Restore scroll position when returning to the listing from a product.
  useEffect(() => {
    const KEY = "sz-plp-scroll";
    const saved = Number(sessionStorage.getItem(KEY) ?? 0);
    if (saved > 0) {
      const id = setTimeout(() => window.scrollTo(0, saved), 60);
      return () => clearTimeout(id);
    }
  }, []);

  useEffect(() => {
    const KEY = "sz-plp-scroll";
    const onScroll = () => {
      try {
        sessionStorage.setItem(KEY, String(Math.round(window.scrollY)));
      } catch {
        /* private mode — position restore is a nicety, not a requirement */
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <div className="grid grid-cols-2 gap-x-3 gap-y-[18px] md:gap-x-[22px] md:gap-y-7 xl:grid-cols-3">
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

        {loading &&
          Array.from({ length: 3 }, (_, i) => (
            <div
              key={`skeleton-${i}`}
              aria-hidden="true"
              className="overflow-hidden rounded-[var(--sz-radius-lg)] border border-line bg-raised"
            >
              <Skeleton className="aspect-square w-full rounded-none" />
              <div className="p-[13px_15px_15px]">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="mt-2 h-3.5 w-1/2" />
              </div>
            </div>
          ))}
      </div>

      {/* Announce progress without stealing focus. */}
      <p aria-live="polite" className="sr-only">
        {loading ? "Loading more pieces" : `Showing ${products.length} of ${total} pieces`}
      </p>

      {hasMore && <div ref={sentinel} aria-hidden="true" className="h-px w-full" />}

      {failed && (
        <div className="mt-10 flex flex-col items-center gap-3 border-t border-line pt-8 text-center">
          <p className="text-sm text-muted">We couldn&rsquo;t load more pieces.</p>
          <button
            type="button"
            onClick={() => {
              setFailed(false);
              void loadMore();
            }}
            className="cursor-pointer rounded-[var(--sz-radius-control)] border border-primary-700 px-5 py-2.5 text-[length:var(--sz-text-control-sm)] font-semibold text-primary-700 transition-colors duration-[var(--sz-dur)] hover:bg-primary-50"
          >
            Try again
          </button>
        </div>
      )}
    </>
  );
}
