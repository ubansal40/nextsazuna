"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Icon, ProductCard } from "@/components/ui";
import type { ProductSummary } from "@/lib/catalog";

export interface EditTab {
  label: string;
  products: ProductSummary[];
}

/**
 * Bestsellers / New Arrivals — spec §Product edit (Sazuna Homepage.dc.html:133-182).
 *
 * Both tabs are fetched on the server and swapped on the client, so switching
 * is instant and neither list costs a round trip. The tablist follows the ARIA
 * pattern: arrow keys move between tabs, and only the selected tab is tabbable.
 */
export function ProductEdit({
  eyebrow,
  link,
  tabs,
}: {
  eyebrow: string;
  link: { text: string; href: string } | null;
  tabs: EditTab[];
}) {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: React.KeyboardEvent) {
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (active + delta + tabs.length) % tabs.length;
    setActive(next);
    tabRefs.current[next]?.focus();
  }

  const products = tabs[active]?.products ?? [];

  return (
    <>
      {eyebrow && (
        <p className="m-0 mb-3 flex items-center gap-2 font-mono text-2xs uppercase tracking-caps text-accent-strong">
          <span aria-hidden="true" className="size-[5px] rotate-45 bg-accent" />
          {eyebrow}
        </p>
      )}

      <div className="flex flex-wrap items-end justify-between gap-5">
        <div
          role="tablist"
          aria-label="Product edits"
          onKeyDown={onKeyDown}
          className="flex items-baseline gap-[26px]"
        >
          {tabs.map((tab, i) => (
            <button
              key={tab.label}
              ref={(node) => {
                tabRefs.current[i] = node;
              }}
              type="button"
              role="tab"
              id={`hp-tab-${i}`}
              aria-selected={i === active}
              aria-controls="hp-tabpanel"
              tabIndex={i === active ? 0 : -1}
              onClick={() => setActive(i)}
              className={cn(
                "m-0 cursor-pointer border-b-2 p-0 pb-[7px] font-[family-name:var(--sz-font-display)] text-h2 font-normal leading-[1.04] tracking-tight transition-colors duration-[var(--sz-dur-fast)] home-narrow:text-h2-sm",
                i === active
                  ? "border-primary-700 text-heading"
                  : "border-transparent text-muted hover:text-body",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {link && (
          <Link
            href={link.href}
            className="inline-flex shrink-0 items-center gap-[7px] whitespace-nowrap text-sm font-semibold text-primary-700 no-underline hover:text-primary-800 hover:no-underline"
          >
            {link.text}
            <Icon name="arrow-right" size={14} strokeWidth={1.8} />
          </Link>
        )}
      </div>

      <div
        id="hp-tabpanel"
        role="tabpanel"
        aria-labelledby={`hp-tab-${active}`}
        className="mt-[30px] grid grid-cols-4 gap-x-[22px] gap-y-[30px] home-wide:grid-cols-3 home-carousel:flex home-carousel:snap-x home-carousel:snap-mandatory home-carousel:gap-3.5 home-carousel:overflow-x-auto home-carousel:pb-2"
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
            className="home-carousel:w-[46%] home-carousel:shrink-0 home-carousel:snap-start"
          />
        ))}
      </div>
    </>
  );
}
