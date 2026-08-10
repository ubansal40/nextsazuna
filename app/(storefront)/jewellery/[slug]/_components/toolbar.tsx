"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { Drawer, Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { Facets } from "@/lib/catalog/facets";
import { clearAllUrl, sortUrl, toggleUrl, SORT_OPTIONS, type FilterState } from "@/lib/catalog/filter-params";
import { buildGroups, FilterOption } from "./filter-sidebar";

interface Props {
  countLabel: string;
  basePath: string;
  state: FilterState;
  sort: string;
  facets: Facets;
}

/**
 * Sticky toolbar — spec §Toolbar, §Filter sheet, §Sort sheet.
 *
 * Desktop shows the result count and a native select. Below 900px it becomes
 * two buttons opening bottom sheets. Native select is deliberate: it gives the
 * platform picker on mobile and full keyboard behaviour for free.
 */
export function Toolbar({ countLabel, basePath, state, sort, facets }: Props) {
  const router = useRouter();
  const [sheet, setSheet] = useState<"filter" | "sort" | null>(null);
  /**
   * What the select shows while the sorted page is still on the wire.
   *
   * `sort` is a server prop, so it only changes once navigation completes.
   * A controlled select bound straight to it snapped back to the previous
   * option the instant React re-rendered, and stayed wrong for the whole round
   * trip — on a slow connection that reads as "the sort didn't take", and the
   * customer picks again. `useOptimistic` holds the chosen value for exactly as
   * long as the transition is pending and then defers to the server's answer,
   * so a failed or redirected navigation cannot leave the control lying about
   * what the grid is showing. The filter links keep using the real `sort`: a
   * URL is a promise about state that exists.
   */
  const [, startTransition] = useTransition();
  const [pendingSort, setPendingSort] = useOptimistic(sort);
  const groups = buildGroups(facets);
  const extra = sort !== "popularity" ? { sort } : {};
  const activeCount = Object.values(state).reduce((n, values) => n + values.length, 0);

  const sheetButton = cn(
    "inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2",
    "rounded-[10px] border border-line bg-raised text-sm font-semibold text-heading",
    "transition-colors duration-[var(--sz-dur-fast)] hover:border-primary-700",
  );

  return (
    <>
      <div className="sticky top-[calc(var(--sz-header-h)-1px)] z-40 mt-[26px] border-b border-line-soft bg-[rgb(var(--sz-canvas-rgb)/.94)] backdrop-blur-[8px]">
        <div className="mx-auto max-w-[var(--sz-container)] px-5 md:px-10">
          {/* Desktop */}
          <div className="hidden items-center justify-between gap-[18px] py-[13px] lg:flex">
            <p aria-live="polite" className="font-mono text-[12.5px] text-muted">
              {countLabel}
            </p>
            <label className="inline-flex items-center gap-2.5 text-[13px] text-muted">
              Sort by
              <span className="relative inline-flex items-center">
                <select
                  aria-label="Sort products"
                  value={pendingSort}
                  onChange={(event) => {
                    const next = event.target.value;
                    startTransition(() => {
                      setPendingSort(next);
                      router.push(sortUrl(basePath, state, next));
                    });
                  }}
                  className={cn(
                    "min-h-[44px] cursor-pointer appearance-none rounded-[9px] border border-line bg-raised",
                    "py-2.5 pl-3.5 pr-[38px] text-sm text-heading outline-none",
                  )}
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <Icon
                  name="chevron-down"
                  size={14}
                  strokeWidth={2}
                  className="pointer-events-none absolute right-[13px] text-muted"
                />
              </span>
            </label>
          </div>

          {/* Mobile */}
          <div className="grid grid-cols-2 gap-2.5 py-2.5 lg:hidden">
            <button type="button" onClick={() => setSheet("filter")} className={sheetButton}>
              <Icon name="filter" size={15} strokeWidth={1.8} />
              Filter
              {activeCount > 0 && (
                <span className="inline-flex min-w-[18px] items-center justify-center rounded-[var(--sz-radius-pill)] bg-primary-700 px-1.5 font-mono text-[length:var(--sz-text-micro)] leading-[18px] text-white">
                  {activeCount}
                </span>
              )}
            </button>
            <button type="button" onClick={() => setSheet("sort")} className={sheetButton}>
              <Icon name="sort" size={15} strokeWidth={1.8} />
              Sort
            </button>
          </div>
        </div>
      </div>

      <Drawer open={sheet === "filter"} onClose={() => setSheet(null)} title="Filters" side="bottom">
        {activeCount > 0 && (
          <Link
            href={clearAllUrl(basePath, extra)}
            onClick={() => setSheet(null)}
            className="mb-2 inline-block text-[12.5px] font-semibold text-muted underline"
          >
            Clear all
          </Link>
        )}
        {groups.map((group) => (
          <details
            key={group.key}
            open={group.defaultOpen || state[group.key].length > 0}
            className="group border-b border-line-soft py-1.5"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between py-3 text-sm font-semibold text-heading marker:hidden [&::-webkit-details-marker]:hidden">
              {group.title}
              <Icon
                name="chevron-down"
                size={15}
                strokeWidth={2}
                className="text-muted transition-transform duration-[250ms] group-open:rotate-180"
              />
            </summary>
            <div className="flex flex-col gap-0.5 pb-3.5 pt-0.5">
              {group.options.map((option) => (
                <FilterOption
                  key={option.value}
                  href={toggleUrl(basePath, state, group.key, option.value, extra)}
                  checked={state[group.key].includes(option.value)}
                  label={option.label}
                  mono={group.mono}
                  onSelect={() => setSheet(null)}
                />
              ))}
            </div>
          </details>
        ))}
      </Drawer>

      <Drawer open={sheet === "sort"} onClose={() => setSheet(null)} title="Sort by" side="bottom">
        {/* radiogroup, not a list: these are mutually exclusive choices. */}
        <div role="radiogroup" aria-label="Sort options" className="-mx-2 py-2">
          {SORT_OPTIONS.map((option) => {
            const selected = option.value === sort;
            return (
              <Link
                key={option.value}
                href={sortUrl(basePath, state, option.value)}
                onClick={() => setSheet(null)}
                role="radio"
                aria-checked={selected}
                className={cn(
                  "flex min-h-12 w-full items-center justify-between gap-3 rounded-[10px] px-3.5 py-3.5",
                  "text-[14.5px] no-underline transition-colors duration-[var(--sz-dur-fast)]",
                  selected ? "font-semibold text-heading" : "text-body",
                  "hover:bg-surface hover:no-underline",
                )}
              >
                {option.label}
                {selected && (
                  <Icon name="check" size={17} strokeWidth={2.4} className="text-primary-700" />
                )}
              </Link>
            );
          })}
        </div>
      </Drawer>
    </>
  );
}
