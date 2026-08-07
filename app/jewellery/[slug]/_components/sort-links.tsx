import Link from "next/link";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui";
import { sortUrl, type FilterState } from "@/lib/catalog/filter-params";

export const SORT_OPTIONS = [
  { value: "popularity", label: "Popularity" },
  { value: "price-asc", label: "Price: Low → High" },
  { value: "price-desc", label: "Price: High → Low" },
  { value: "newest", label: "Newest" },
  { value: "bestselling", label: "Best Selling" },
] as const;

export const SORT_VALUES = new Set(SORT_OPTIONS.map((o) => o.value));

/**
 * Desktop sort — a native <details> menu of links.
 *
 * Links rather than a <select> so each sort order is a real, shareable URL and
 * the control works without JavaScript. <details> supplies the open/close state
 * and keyboard behaviour, keeping this a Server Component.
 */
export function SortLinks({
  basePath,
  state,
  current,
}: {
  basePath: string;
  state: FilterState;
  current: string;
}) {
  const active = SORT_OPTIONS.find((o) => o.value === current) ?? SORT_OPTIONS[0];

  return (
    <details className="group relative">
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-2.5 rounded-[var(--sz-radius-control)] border border-line bg-raised",
          "px-[13px] py-[9px] text-[length:var(--sz-text-control-sm)] text-body",
          "marker:hidden [&::-webkit-details-marker]:hidden",
          "transition-colors duration-[var(--sz-dur-fast)] hover:border-primary-700",
        )}
      >
        <span className="text-muted">Sort by</span>
        <span className="font-semibold">{active.label}</span>
        <Icon
          name="chevron-down"
          size={16}
          className="text-muted transition-transform duration-[var(--sz-dur)] group-open:rotate-180"
        />
      </summary>

      <ul className="absolute right-0 top-[calc(100%+6px)] z-[50] w-[220px] list-none rounded-[var(--sz-radius-md)] border border-line bg-canvas p-1.5 shadow-lg m-0 animate-scale-in">
        {SORT_OPTIONS.map((option) => (
          <li key={option.value}>
            <Link
              href={sortUrl(basePath, state, option.value)}
              scroll={false}
              aria-current={option.value === current ? "true" : undefined}
              className={cn(
                "flex items-center justify-between gap-2 rounded-[var(--sz-radius-sm)] px-2.5 py-2 text-sm no-underline",
                option.value === current
                  ? "bg-primary-50 font-semibold text-primary-700"
                  : "text-body hover:bg-primary-50 hover:text-primary-700",
                "hover:no-underline",
              )}
            >
              {option.label}
              {option.value === current && <Icon name="check" size={14} />}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
