import { Fragment, type ReactNode } from "react";
import { Prose } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { PolicyPage as PolicyPageData } from "@/lib/content-pages/types";
import { ContentCta } from "./content-cta";
import { PolicyBlocks } from "./policy-blocks";
import { PolicyToc, type TocEntry } from "./policy-toc";

/**
 * The policy page furniture — Sazuna Policy.dc.html.
 *
 * Header, table-of-contents grid and closing panel, shared by the five policy
 * routes and by the FAQ, which the spec builds from the same component with
 * topics in place of prose sections. `children` is that seam: pass nothing and
 * the page renders its own sections.
 *
 * Server Component throughout except the table of contents, which needs scroll
 * position.
 */

/** The mono eyebrow above every content-page title. */
export function ContentKicker({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 mb-3 flex items-center gap-2 font-mono text-badge uppercase tracking-[var(--sz-tracking-caps)] text-accent-strong">
      <span aria-hidden className="size-[5px] rotate-45 bg-accent" />
      {children}
    </p>
  );
}

export const policyContainer =
  "mx-auto max-w-[var(--sz-policy-container)] px-10 pb-24 policy-narrow:px-[18px]";

/**
 * The page header — kicker, title, revision date. Shared with the FAQ, which
 * the spec gives the same header and closing panel but no table of contents.
 */
export function ContentHeader({
  kicker,
  title,
  updated,
  children,
}: {
  kicker: string;
  title: string;
  updated: string;
  children?: ReactNode;
}) {
  return (
    <header className="max-w-[var(--sz-prose-max)] pt-[34px]">
      <ContentKicker>{kicker}</ContentKicker>
      <h1 className="m-0 text-content-h1 font-normal tracking-tight text-heading policy-stacked:text-content-h1-sm">
        {title}
      </h1>
      <p className="m-0 mt-3 font-mono text-xs text-muted-soft">Last updated · {updated}</p>
      {children}
    </header>
  );
}

export function PolicyPage({ page }: { page: PolicyPageData }) {
  const toc: TocEntry[] = page.sections.map((s) => ({ id: s.id, label: s.heading }));

  return (
    <div className={policyContainer}>
      <ContentHeader kicker={page.kicker} title={page.title} updated={page.updated} />

      <div
        className={cn(
          "mt-9 grid items-start gap-[var(--sz-toc-gap)]",
          "grid-cols-[var(--sz-toc-w)_minmax(0,1fr)]",
          "policy-stacked:mt-5 policy-stacked:grid-cols-1 policy-stacked:gap-0",
        )}
      >
        <PolicyToc entries={toc} />

        <div>
          <Prose>
            {/* Flat, as the spec renders it: a section wrapper would put the
                first heading's top margin back on the page header. */}
            {page.sections.map((section) => (
              <Fragment key={section.id}>
                <h2 id={section.id}>{section.heading}</h2>
                <PolicyBlocks blocks={section.blocks} />
              </Fragment>
            ))}
          </Prose>

          <ContentCta cta={page.cta} className="max-w-[var(--sz-prose-max)]" />
        </div>
      </div>
    </div>
  );
}
