import Link from "next/link";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui";
import type { Facets } from "@/lib/catalog/facets";
import {
  clearAllUrl,
  toggleUrl,
  type FilterKey,
  type FilterState,
} from "@/lib/catalog/filter-params";

interface Group {
  key: FilterKey;
  title: string;
  options: { value: string; label: string; count: number }[];
  /** The spec opens price, category and the first attribute group by default. */
  defaultOpen: boolean;
}

export function buildGroups(facets: Facets): Group[] {
  const groups: Group[] = [
    { key: "price", title: "Price", options: facets.price, defaultOpen: true },
    { key: "cat", title: "Category", options: facets.category, defaultOpen: true },
    { key: "material", title: "Material", options: facets.material, defaultOpen: true },
    { key: "purity", title: "Purity", options: facets.purity, defaultOpen: false },
    { key: "collection", title: "Collection", options: facets.collection, defaultOpen: false },
  ];
  // A group with no options is dropped entirely: an empty filter reads as a
  // broken page, and several of these fields are sparsely populated today.
  return groups.filter((group) => group.options.length > 0);
}

interface Props {
  facets: Facets;
  state: FilterState;
  basePath: string;
  sort?: string;
  /** Rendered inside the mobile sheet rather than the sticky rail. */
  variant?: "rail" | "sheet";
}

/**
 * Filter rail — spec §Filters sidebar.
 *
 * A Server Component built from links, so filtering needs no JavaScript and
 * every option is independently addressable. Groups use native <details> for
 * the same reason.
 */
export function FilterSidebar({ facets, state, basePath, sort, variant = "rail" }: Props) {
  const groups = buildGroups(facets);
  const active = Object.values(state).reduce((n, values) => n + values.length, 0);
  const extra = sort ? { sort } : {};

  if (groups.length === 0) return null;

  return (
    <aside
      aria-label="Filters"
      className={cn(
        variant === "rail" &&
          "hidden w-[var(--sz-plp-sidebar)] shrink-0 self-start overflow-auto overscroll-contain lg:block",
        variant === "rail" &&
          "sticky top-[calc(var(--sz-header-h)+72px)] max-h-[calc(100vh-var(--sz-header-h)-92px)]",
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-mono text-2xs uppercase tracking-[var(--sz-tracking-caps)] text-muted">
          Filters
        </h2>
        {active > 0 && (
          <Link
            href={clearAllUrl(basePath, extra)}
            className="text-xs font-semibold text-primary-700 no-underline hover:underline"
          >
            Clear all
          </Link>
        )}
      </div>

      <div className="divide-y divide-line border-y border-line">
        {groups.map((group) => (
          <details key={group.key} open={group.defaultOpen || state[group.key].length > 0} className="group">
            <summary
              className={cn(
                "flex cursor-pointer list-none items-center justify-between py-3.5",
                "text-sm font-semibold text-body marker:hidden [&::-webkit-details-marker]:hidden",
                "transition-colors duration-[var(--sz-dur-fast)] hover:text-primary-700",
              )}
            >
              <span className="inline-flex items-center gap-2">
                {group.title}
                {state[group.key].length > 0 && (
                  <span className="inline-flex min-w-[18px] items-center justify-center rounded-[var(--sz-radius-pill)] bg-primary-700 px-1.5 font-mono text-[length:var(--sz-text-micro)] leading-[18px] text-white">
                    {state[group.key].length}
                  </span>
                )}
              </span>
              <Icon
                name="chevron-down"
                size={16}
                className="text-muted transition-transform duration-[var(--sz-dur)] ease-[var(--sz-ease-out)] group-open:rotate-180"
              />
            </summary>

            <ul className="flex flex-col gap-0.5 list-none p-0 pb-3.5 m-0">
              {group.options.map((option) => {
                const checked = state[group.key].includes(option.value);
                return (
                  <li key={option.value}>
                    <Link
                      href={toggleUrl(basePath, state, group.key, option.value, extra)}
                      scroll={false}
                      aria-pressed={checked}
                      className={cn(
                        "flex min-h-[34px] items-center gap-2.5 rounded-[var(--sz-radius-sm)] px-1.5 py-1.5 no-underline",
                        "text-sm transition-colors duration-[var(--sz-dur-fast)]",
                        checked ? "text-primary-700" : "text-body hover:text-primary-700",
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
    </aside>
  );
}
