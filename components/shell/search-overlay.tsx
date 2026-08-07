"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui";
import { jewelleryUrl, NAV_CATEGORIES } from "@/lib/navigation";

interface Suggestion {
  name: string;
  href: string;
  sku: string | null;
  price: string;
  imageUrl: string | null;
}

export interface SearchOverlayProps {
  onClose: () => void;
  /**
   * Deep link for the "ask us instead" escape hatch on no results. Absent when
   * no WhatsApp number is configured — the button is dropped, not broken.
   */
  whatsappHref?: string | null;
}

/** The spec's curated starting points. They seed the box rather than navigate. */
const POPULAR = ["Bridal sets", "Diamond studs", "Rose gold", "Nose pins"];

const RECENT_KEY = "sazuna:recent-searches";
const RECENT_MAX = 4;

const eyebrowClass =
  "m-0 mb-3.5 font-mono text-eyebrow uppercase tracking-eyebrow text-accent-strong";

function readRecent(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    // Private browsing, a full quota or hand-edited junk — none of which are
    // worth breaking search over.
    return [];
  }
}

/**
 * Search overlay — spec §Search overlay (SazunaHeader.dc.html:195-261).
 *
 * Three states behind one field: the starting point, live suggestions, and a
 * dead end that offers a human. Suggestions come from /api/search, which reuses
 * the listing query so the overlay and the results page agree on what matches.
 */
export function SearchOverlay({ onClose, whatsappHref }: SearchOverlayProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  // Mounted only while open, so reading storage here runs on the client exactly
  // once and never during a server render.
  const [recent] = useState(readRecent);
  /**
   * The last settled response, tagged with the query it answered.
   *
   * Keeping the query alongside the products is what lets "nothing matched" be
   * derived rather than stored: results belong to a query or they do not, so
   * the empty state can never flash while a newer request is still in the air.
   */
  const [answer, setAnswer] = useState<{ query: string; products: Suggestion[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = query.trim();

  useEffect(() => {
    inputRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);

    // The panel scrolls on its own; the page behind it must not.
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  // Debounced suggestions. The abort controller means a slow early response can
  // never overwrite the results of a later, faster one.
  useEffect(() => {
    if (!trimmed) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data: { products?: Suggestion[] } = await response.json();
        setAnswer({ query: trimmed, products: data.products ?? [] });
      } catch {
        // Aborted or offline. Leave the previous state rather than claiming
        // there are no matches when we simply failed to ask.
      }
    }, 180);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [trimmed]);

  const submit = useCallback(
    (term: string) => {
      const value = term.trim();
      if (!value) return;
      try {
        const next = [value, ...readRecent().filter((r) => r !== value)].slice(0, RECENT_MAX);
        window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        // Not being able to remember a search is not a reason to refuse it.
      }
      onClose();
      router.push(`/search/${encodeURIComponent(value)}`);
    },
    [onClose, router],
  );

  const matchedCategories = trimmed
    ? NAV_CATEGORIES.filter((category) =>
        category.label.toLowerCase().includes(trimmed.toLowerCase()),
      )
    : [];

  const settled = answer?.query === trimmed;
  const results = settled ? answer.products : [];

  const showStart = trimmed.length === 0;
  const showResults = results.length > 0;
  const showNoResults = Boolean(trimmed) && settled && results.length === 0;

  return (
    <>
      <div
        className="fixed inset-0 z-[80] bg-[var(--sz-scrim)] animate-fade"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="fixed inset-x-0 top-0 z-[81] max-h-[88vh] overflow-y-auto border-b border-line bg-canvas shadow-search animate-search-in"
      >
        <div className="mx-auto max-w-[var(--sz-container-search)] px-6 pb-[30px] pt-[22px]">
          <div className="flex items-center gap-3 rounded-md border border-primary-700 bg-raised px-[15px] py-[13px] shadow-[var(--sz-ring-search)]">
            <span className="text-primary-700">
              <Icon name="search" size={21} />
            </span>
            <input
              ref={inputRef}
              type="search"
              role="combobox"
              aria-expanded={showResults}
              aria-controls="search-suggestions"
              aria-label="Search Sazuna"
              placeholder="Search rings, mangalsutra, gold colour…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit(query);
              }}
              // The ring belongs to the field box around it, so the input must
              // not draw a second one inside the first.
              className="min-w-0 flex-1 border-none bg-transparent text-search-input text-heading outline-none focus-visible:shadow-none [&::-webkit-search-cancel-button]:hidden"
            />
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-sm border border-line bg-surface px-[9px] py-[5px] font-mono text-eyebrow tracking-esc text-muted"
            >
              ESC
            </button>
          </div>

          {showStart && (
            <div
              className={cn(
                "mt-[26px] grid gap-8",
                recent.length > 0 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1",
              )}
            >
              {recent.length > 0 && (
                <div>
                  <p className={eyebrowClass}>Recent</p>
                  <div className="flex flex-col gap-1">
                    {recent.map((term) => (
                      <button
                        key={term}
                        type="button"
                        onClick={() => setQuery(term)}
                        className="flex cursor-pointer items-center gap-2.5 rounded-[var(--sz-radius-control)] px-2.5 py-[9px] text-left text-sm text-body transition-colors duration-[var(--sz-dur-fast)] hover:bg-surface"
                      >
                        <Icon
                          name="clock"
                          size={15}
                          strokeWidth={1.6}
                          className="text-muted-soft"
                        />
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className={eyebrowClass}>Popular</p>
                <div className="flex flex-wrap gap-2">
                  {POPULAR.map((term) => (
                    <button
                      key={term}
                      type="button"
                      onClick={() => setQuery(term)}
                      className="cursor-pointer rounded-pill border border-primary-200 bg-primary-50 px-3.5 py-[7px] text-control-sm text-primary-700 transition-colors duration-[var(--sz-dur-fast)] hover:border-primary-700"
                    >
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {showResults && (
            <div className="mt-6" id="search-suggestions">
              <p className={eyebrowClass}>Suggestions</p>
              <div className="flex flex-col gap-1">
                {results.map((product) => (
                  <Link
                    key={product.href}
                    href={product.href}
                    onClick={onClose}
                    className="flex items-center gap-3.5 rounded-md px-2.5 py-[9px] no-underline transition-colors duration-[var(--sz-dur-fast)] hover:bg-surface hover:no-underline"
                  >
                    <span className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-[var(--sz-radius-control)] bg-[repeating-linear-gradient(135deg,var(--sz-line-soft)_0_7px,var(--sz-surface)_7px_14px)]">
                      {product.imageUrl ? (
                        <Image
                          src={product.imageUrl}
                          alt=""
                          fill
                          sizes="44px"
                          className="object-cover"
                        />
                      ) : (
                        <span className="size-3.5 rotate-45 bg-accent opacity-55" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-heading">{product.name}</span>
                      {product.sku && (
                        <span className="font-mono text-2xs text-muted">{product.sku}</span>
                      )}
                    </span>
                    <span className="font-mono text-control-sm text-heading">{product.price}</span>
                  </Link>
                ))}
              </div>

              {matchedCategories.length > 0 && (
                <>
                  <p className={cn(eyebrowClass, "mb-2.5 mt-[18px]")}>Categories</p>
                  <div className="flex flex-wrap gap-2">
                    {matchedCategories.map((category) => (
                      <Link
                        key={category.slug}
                        href={jewelleryUrl(category.slug)}
                        onClick={onClose}
                        className="inline-flex items-center gap-[7px] rounded-pill border border-line bg-raised px-3.5 py-2 text-control-sm font-semibold text-body no-underline transition-colors duration-[var(--sz-dur-fast)] hover:border-accent hover:no-underline"
                      >
                        <span aria-hidden="true" className="size-1.5 rotate-45 bg-accent" />
                        {category.label}
                      </Link>
                    ))}
                  </div>
                </>
              )}

              <button
                type="button"
                onClick={() => submit(query)}
                className="mt-[18px] flex w-full cursor-pointer items-center justify-between gap-2.5 rounded-md bg-primary-700 px-[15px] py-[13px] text-sm font-semibold text-white transition-colors duration-[var(--sz-dur-fast)] hover:bg-primary-800"
              >
                View all results for “{trimmed}”
                <Icon name="arrow-right" size={16} strokeWidth={1.9} />
              </button>
            </div>
          )}

          {showNoResults && (
            <div className="mt-[30px] px-0 pb-3 pt-6 text-center">
              <div className="mx-auto flex size-[52px] items-center justify-center rounded-pill bg-surface text-accent-strong">
                <Icon name="search" size={24} strokeWidth={1.6} />
              </div>
              <p className="m-0 mt-3.5 font-[family-name:var(--sz-font-display)] text-dropdown-title text-heading">
                No matches for “{trimmed}”
              </p>
              <p className="mx-0 mb-4 mt-1.5 text-sm text-muted">
                Try a product type or gold colour — or ask us directly.
              </p>
              <div className="flex flex-wrap justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => submit(query)}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--sz-radius-control)] bg-primary-700 px-[18px] py-[11px] text-sm font-semibold text-white transition-colors duration-[var(--sz-dur-fast)] hover:bg-primary-800"
                >
                  See all results
                </button>
                {whatsappHref && (
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-[var(--sz-radius-control)] border border-primary-200 bg-raised px-[18px] py-[11px] text-sm font-semibold text-primary-700 no-underline transition-colors duration-[var(--sz-dur-fast)] hover:border-primary-700 hover:bg-primary-50 hover:no-underline"
                  >
                    <Icon name="whatsapp-solid" size={16} />
                    Ask on WhatsApp
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
