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

const SCROLL_KEY = "sz-plp-scroll";

/** What we park in sessionStorage on the way to a product. */
interface SavedScroll {
  /** Identity of the listing the offset was taken from. */
  listing?: unknown;
  y?: unknown;
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
  /**
   * "The server has nothing further for us", independently of `total`.
   *
   * `products.length < total` is the wrong thing to trust on its own: it is a
   * count taken by a separate COUNT(DISTINCT) query, and any page that comes
   * back short — or entirely of rows we already hold — leaves the accumulated
   * list permanently below it. That is not academic. Before the price sorts
   * gained a tiebreaker, unstable LIMIT/OFFSET paging returned duplicates, the
   * dedupe below quietly dropped them, `hasMore` never went false, and the
   * sentinel stayed mounted inside its own 640px rootMargin — so it re-fired
   * the moment the observer re-registered, looping COUNT(DISTINCT) and
   * deep-OFFSET queries forever. The ordering fix removes that cause; this
   * removes the whole class of it, since a catalogue edit between two requests
   * can make `total` stale at any time.
   */
  const [exhausted, setExhausted] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const page = useRef(1);
  /**
   * Ids already on screen, built once and mutated in place. Keeping it rather
   * than deriving it holds the dedupe at O(page) instead of rebuilding a Set
   * over the whole accumulated list on every load — this grid runs to thousands
   * of cards. It never drives rendering, so it deliberately has no setter.
   */
  const [seen] = useState(() => new Set(initial.map((p) => p.id)));
  /**
   * In-flight guard. A ref, not `loading`, because a piece of state read inside
   * `loadMore` has to be in its dependency list, and that changes the
   * callback's identity mid-load — which tears down and re-registers the
   * observer, and re-registering inside the rootMargin fires it again.
   */
  const busy = useRef(false);

  // Note: no effect resets this state when filters change. The parent passes a
  // `key` derived from the active filters and sort, so a change remounts this
  // component with fresh state — React's own answer to "reset on prop change",
  // and it avoids an extra render pass.

  const hasMore = !exhausted && products.length < total;

  const loadMore = useCallback(async () => {
    if (busy.current || failed) return;
    busy.current = true;
    setLoading(true);
    try {
      const next = await loadMoreProducts({ ...request, page: page.current + 1, pageSize });
      page.current += 1;

      const fresh = next.filter((p) => !seen.has(p.id));
      for (const product of fresh) seen.add(product.id);

      // A short page is the end of the list. A page that adds nothing new means
      // asking again would only fetch the same rows a third time.
      if (next.length < pageSize || fresh.length === 0) setExhausted(true);
      if (fresh.length > 0) setProducts((current) => [...current, ...fresh]);
    } catch {
      setFailed(true);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [failed, request, pageSize, seen]);

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

  /**
   * Scroll restoration — spec §Product grid, "restores scroll position when
   * returning from a product".
   *
   * The offset is stamped with the identity of the listing it was taken from,
   * written only as the customer leaves for a product, and consumed on the way
   * back. So it can restore that one listing, once, and nothing else.
   *
   * It used to be a bare number under a single global key, rewritten on every
   * scroll frame and replayed on every mount. A *fresh* listing therefore
   * inherited the previous one's offset and jumped 60ms after paint: opening a
   * different category from the menu, running a search, or changing any filter
   * or sort — all of which mount this component, the last two by design via the
   * `key` in product-listing.tsx — scrolled the customer down a page they had
   * never scrolled. The filter links pass `scroll={false}` precisely to hold
   * position; this effect then overrode them.
   */
  const listingKey = JSON.stringify(request);

  const rememberPosition = useCallback(() => {
    try {
      sessionStorage.setItem(
        SCROLL_KEY,
        JSON.stringify({ listing: listingKey, y: Math.round(window.scrollY) }),
      );
    } catch {
      /* private mode — position restore is a nicety, not a requirement */
    }
  }, [listingKey]);

  useEffect(() => {
    let saved: SavedScroll | null = null;
    try {
      const raw = sessionStorage.getItem(SCROLL_KEY);
      // Consumed whether or not it matches. An entry belonging to another
      // listing is stale by definition, and leaving it in place is what let it
      // fire on an unrelated mount in the first place.
      sessionStorage.removeItem(SCROLL_KEY);
      if (raw) saved = JSON.parse(raw) as SavedScroll;
    } catch {
      return;
    }

    if (!saved || saved.listing !== listingKey) return;
    const y = typeof saved.y === "number" ? saved.y : 0;
    if (y <= 0) return;

    const id = setTimeout(() => window.scrollTo(0, y), 60);
    return () => clearTimeout(id);
  }, [listingKey]);

  return (
    <>
      {/* Records the position on the way out. Card clicks — pointer and
          keyboard alike, both raise click — bubble to here, so the offset is
          only ever stored when the customer actually leaves for a product. */}
      <div
        onClick={rememberPosition}
        className="grid grid-cols-2 gap-x-3 gap-y-[18px] md:gap-x-[22px] md:gap-y-7 xl:grid-cols-3"
      >
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
