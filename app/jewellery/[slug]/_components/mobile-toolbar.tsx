"use client";

import { useState } from "react";
import Link from "next/link";
import { Drawer, Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { Facets } from "@/lib/catalog/facets";
import { sortUrl, type FilterState } from "@/lib/catalog/filter-params";
import { SORT_OPTIONS } from "./sort-links";

interface Props {
  total: number;
  activeCount: number;
  basePath: string;
  state: FilterState;
  sort?: string;
  facets: Facets;
}

/**
 * Mobile filter and sort — spec §Filter sheet / §Sort sheet.
 *
 * Below the sidebar breakpoint the rail is replaced by two buttons that open
 * sheets. This is the one part of the listing that genuinely needs client
 * state; the filter controls inside are still the same links, so selecting one
 * navigates and the sheet closes with the page transition.
 */
export function MobileToolbar({ total, activeCount, basePath, state, sort, facets }: Props) {
  const [sheet, setSheet] = useState<"filter" | "sort" | null>(null);
  const current = sort ?? "popularity";

  const groups = [
    { key: "price" as const, title: "Price", options: facets.price },
    { key: "cat" as const, title: "Category", options: facets.category },
    { key: "material" as const, title: "Material", options: facets.material },
    { key: "purity" as const, title: "Purity", options: facets.purity },
    { key: "collection" as const, title: "Collection", options: facets.collection },
  ].filter((group) => group.options.length > 0);

  const button = cn(
    "inline-flex items-center justify-center gap-2 rounded-[var(--sz-radius-control)] border border-line bg-raised",
    "px-4 py-2.5 text-[length:var(--sz-text-control-sm)] font-semibold text-body cursor-pointer",
    "transition-colors duration-[var(--sz-dur-fast)] hover:border-primary-700 hover:text-primary-700",
  );

  const toggleHref = (key: (typeof groups)[number]["key"], value: string) => {
    const next = state[key].includes(value)
      ? state[key].filter((v) => v !== value)
      : [...state[key], value];
    const params = new URLSearchParams();
    for (const [k, values] of Object.entries({ ...state, [key]: next })) {
      if (values.length) params.set(k, values.join(","));
    }
    if (sort) params.set("sort", sort);
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-2.5 border-y border-line py-3 lg:hidden">
        <button type="button" onClick={() => setSheet("filter")} className={button}>
          <Icon name="filter" size={16} />
          Filter
          {activeCount > 0 && (
            <span className="inline-flex min-w-[18px] items-center justify-center rounded-[var(--sz-radius-pill)] bg-primary-700 px-1.5 font-mono text-[length:var(--sz-text-micro)] leading-[18px] text-white">
              {activeCount}
            </span>
          )}
        </button>
        <button type="button" onClick={() => setSheet("sort")} className={button}>
          <Icon name="sort" size={16} />
          Sort
        </button>
      </div>

      <p className="mb-5 text-sm text-muted lg:hidden">
        <span className="font-mono tabular-nums text-body">{total.toLocaleString("en-IN")}</span>{" "}
        {total === 1 ? "piece" : "pieces"}
      </p>

      <Drawer open={sheet === "filter"} onClose={() => setSheet(null)} title="Filters" side="left">
        <div className="divide-y divide-line border-y border-line">
          {groups.map((group) => (
            <details key={group.key} open={state[group.key].length > 0} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between py-3.5 text-sm font-semibold text-body marker:hidden [&::-webkit-details-marker]:hidden">
                {group.title}
                <Icon
                  name="chevron-down"
                  size={16}
                  className="text-muted transition-transform duration-[var(--sz-dur)] group-open:rotate-180"
                />
              </summary>
              <ul className="flex flex-col gap-0.5 list-none p-0 pb-3.5 m-0">
                {group.options.map((option) => {
                  const checked = state[group.key].includes(option.value);
                  return (
                    <li key={option.value}>
                      <Link
                        href={toggleHref(group.key, option.value)}
                        scroll={false}
                        onClick={() => setSheet(null)}
                        className={cn(
                          "flex min-h-[38px] items-center gap-2.5 rounded-[var(--sz-radius-sm)] px-1.5 py-2 text-sm no-underline",
                          checked ? "text-primary-700" : "text-body",
                          "hover:bg-primary-50 hover:no-underline",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "inline-flex size-[18px] shrink-0 items-center justify-center rounded-[var(--sz-radius-xs)] border",
                            checked
                              ? "border-primary-700 bg-primary-700 text-white"
                              : "border-control-border bg-raised",
                          )}
                        >
                          {checked && <Icon name="check" size={12} strokeWidth={2.6} />}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{option.label}</span>
                        <span className="font-mono text-2xs tabular-nums text-muted">
                          {option.count}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </details>
          ))}
        </div>
      </Drawer>

      <Drawer open={sheet === "sort"} onClose={() => setSheet(null)} title="Sort by" side="left">
        <ul className="flex flex-col gap-1 list-none p-0 m-0">
          {SORT_OPTIONS.map((option) => (
            <li key={option.value}>
              <Link
                href={sortUrl(basePath, state, option.value)}
                scroll={false}
                onClick={() => setSheet(null)}
                aria-current={option.value === current ? "true" : undefined}
                className={cn(
                  "flex items-center justify-between rounded-[var(--sz-radius-sm)] px-3 py-3 text-sm no-underline",
                  option.value === current
                    ? "bg-primary-50 font-semibold text-primary-700"
                    : "text-body hover:bg-primary-50",
                  "hover:no-underline",
                )}
              >
                {option.label}
                {option.value === current && <Icon name="check" size={16} />}
              </Link>
            </li>
          ))}
        </ul>
      </Drawer>
    </>
  );
}
