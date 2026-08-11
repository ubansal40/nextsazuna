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
  defaultOpen: boolean;
  /** Numeric labels are set in Geist Mono per the spec; words are not. */
  mono?: boolean;
}

export function buildGroups(facets: Facets): Group[] {
  const groups: Group[] = [
    { key: "price", title: "Price", options: facets.price, defaultOpen: true, mono: true },
    { key: "cat", title: "Category", options: facets.category, defaultOpen: true },
    { key: "material", title: "Material", options: facets.material, defaultOpen: true },
    { key: "purity", title: "Purity", options: facets.purity, defaultOpen: false, mono: true },
    { key: "collection", title: "Collection", options: facets.collection, defaultOpen: false },
  ];
  // A group with no options is dropped: an empty filter reads as a broken page,
  // and several of these fields are sparsely populated today.
  return groups.filter((group) => group.options.length > 0);
}

/**
 * Filter option row. `role="checkbox"` matches the spec's semantics — these are
 * toggles, not navigation — while remaining a link so filtering works without
 * JavaScript and every combination is addressable.
 */
function Option({
  href,
  checked,
  label,
  mono,
  compact,
  onSelect,
}: {
  href: string;
  checked: boolean;
  label: string;
  mono?: boolean;
  /** The rail packs tighter than the mobile sheet, per the spec's own override. */
  compact?: boolean;
  onSelect?: () => void;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      role="checkbox"
      aria-checked={checked}
      onClick={onSelect}
      className={cn(
        "flex items-center gap-[11px] px-0.5 text-left text-sm text-body no-underline",
        compact ? "min-h-[34px] py-1.5" : "min-h-[44px] py-2.5",
        "transition-colors duration-[var(--sz-dur-fast)] hover:text-primary-700 hover:no-underline",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex size-5 shrink-0 items-center justify-center rounded-[var(--sz-radius-sm)] border",
          checked ? "border-primary-700 bg-primary-700 text-white" : "border-control-border bg-raised",
        )}
      >
        {checked && <Icon name="check" size={13} strokeWidth={2.6} />}
      </span>
      <span className={cn(mono && "font-mono text-[length:var(--sz-text-control-sm)]")}>
        {label}
      </span>
    </Link>
  );
}

interface Props {
  facets: Facets;
  state: FilterState;
  basePath: string;
  sort?: string;
}

/**
 * Filter rail — spec §Filters sidebar.
 *
 * Sticky below the header, scrolls independently, and hides below 900px where
 * the mobile sheet takes over. Built from links and native <details>, so it is
 * a Server Component and needs no JavaScript.
 */
export function FilterSidebar({ facets, state, basePath, sort }: Props) {
  const groups = buildGroups(facets);
  const active = Object.values(state).reduce((n, values) => n + values.length, 0);
  const extra = sort ? { sort } : {};

  if (groups.length === 0) return null;

  return (
    <aside
      aria-label="Filters"
      className={cn(
        "hidden self-start overflow-auto overscroll-contain lg:block",
        /*
         * Pinned clear of the toolbar, not against it.
         *
         * The offset used to be `header-h + 72px`, a number that stood in for
         * the toolbar's height and was two pixels short of it: the toolbar
         * sticks 1px under the header and is 71px tall, so its pinned bottom
         * edge is at header-h + 70 and the rail landed at header-h + 72. On a
         * page that is not scrolled the section's own margin gives 28px and it
         * looks right — the two rules only meet once both are stuck.
         *
         * `--sz-plp-sidebar-top` is that arithmetic written down once, from the
         * same toolbar-height token the toolbar sizes itself with.
         */
        "sticky top-[var(--sz-plp-sidebar-top)]",
        "max-h-[calc(100vh-var(--sz-plp-sidebar-top)-var(--sz-plp-sidebar-gap))]",
      )}
    >
      <div className="flex items-baseline justify-between gap-3 border-b border-line-soft pb-3.5">
        <h2 className="font-[family-name:var(--sz-font-display)] text-[19px] font-medium text-heading">
          Filters
        </h2>
        {active > 0 && (
          <Link
            href={clearAllUrl(basePath, extra)}
            scroll={false}
            className="py-1.5 text-[12.5px] font-semibold text-muted underline hover:text-body"
          >
            Clear all
          </Link>
        )}
      </div>

      {groups.map((group) => (
        <details
          key={group.key}
          open={group.defaultOpen || state[group.key].length > 0}
          className="group border-b border-line-soft py-1.5"
        >
          <summary
            className={cn(
              "flex cursor-pointer list-none items-center justify-between gap-2.5 py-3",
              "text-sm font-semibold text-heading marker:hidden [&::-webkit-details-marker]:hidden",
            )}
          >
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
              <Option
                key={option.value}
                href={toggleUrl(basePath, state, group.key, option.value, extra)}
                checked={state[group.key].includes(option.value)}
                label={option.label}
                mono={group.mono}
                compact
              />
            ))}
          </div>
        </details>
      ))}
    </aside>
  );
}

export { Option as FilterOption };
