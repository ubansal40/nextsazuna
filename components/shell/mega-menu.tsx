import Link from "next/link";
import { Icon } from "@/components/ui";
import type { NavCategory } from "@/lib/navigation";

/**
 * Mega-menu panel — spec §Global shell. Rendered by SiteHeader when a category
 * with columns is hovered or focused. Purely presentational; the open/close
 * state and its dismissal live in the header.
 */
export function MegaMenu({ category }: { category: NavCategory }) {
  if (!category.columns?.length) return null;

  return (
    <div className="absolute inset-x-0 top-full z-[70] border-t border-line bg-canvas shadow-md animate-fade">
      <div className="mx-auto grid max-w-[var(--sz-container)] grid-cols-[repeat(3,minmax(0,1fr))_320px] gap-10 px-10 py-9">
        {category.columns.map((column) => (
          <div key={column.title}>
            <p className="mb-3.5 font-mono text-2xs uppercase tracking-[var(--sz-tracking-caps)] text-muted">
              {column.title}
            </p>
            <ul className="flex flex-col gap-2.5 list-none p-0 m-0">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-body no-underline transition-colors duration-[var(--sz-dur-fast)] hover:text-primary-700"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {category.feature && (
          <Link
            href={category.feature.href}
            className="group flex flex-col justify-end rounded-[var(--sz-radius-lg)] border border-line bg-surface p-6 no-underline hover:no-underline"
          >
            <span className="font-mono text-2xs uppercase tracking-[var(--sz-tracking-caps)] text-primary-700">
              {category.feature.eyebrow}
            </span>
            <span className="mt-2 font-[family-name:var(--sz-font-display)] text-lg text-heading">
              {category.feature.title}
            </span>
            <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700">
              Explore
              <Icon
                name="chevron-right"
                size={16}
                className="transition-transform duration-[var(--sz-dur)] ease-[var(--sz-ease-out)] group-hover:translate-x-1"
              />
            </span>
          </Link>
        )}
      </div>
    </div>
  );
}
