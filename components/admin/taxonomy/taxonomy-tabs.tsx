"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import type { TaxonomyCounts } from "@/lib/admin/taxonomy";

/**
 * The taxonomy tab strip — Sazuna Admin Taxonomy.dc.html. Five tabs, one per
 * vocabulary, each a real route (they are separate sidebar entries too), with
 * the active one from the URL and a live count pill.
 */

const TABS = [
  { href: "/admin/categories", label: "Categories", key: "categories" },
  { href: "/admin/collections", label: "Collections", key: "collections" },
  { href: "/admin/tags", label: "Tags", key: "tags" },
  { href: "/admin/materials", label: "Materials", key: "materials" },
  { href: "/admin/purities", label: "Purities", key: "purities" },
] as const;

export function TaxonomyTabs({ counts }: { counts: TaxonomyCounts }) {
  const pathname = usePathname();
  return (
    <div role="tablist" aria-label="Taxonomy sections" className="mb-4 flex flex-wrap gap-1 border-b border-line">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            role="tab"
            aria-selected={active}
            className={cn(
              "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-semibold no-underline hover:no-underline",
              active ? "border-primary-700 text-primary-700" : "border-transparent text-muted hover:text-body",
            )}
          >
            {tab.label}
            <span className="rounded-pill bg-surface px-1.5 font-mono text-[10px] text-muted">{counts[tab.key]}</span>
          </Link>
        );
      })}
    </div>
  );
}
