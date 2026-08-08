import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Prose — the running-text wrapper for the long-form content pages.
 *
 * The system has no typography layer: `@layer base` styles the body, the four
 * heading levels and links, and stops. Everything else on the site is a UI
 * surface where each paragraph is classed by hand, which is right there and
 * unbearable across eleven policy pages.
 *
 * This styles descendants from a wrapper rather than adding base rules for
 * `p`/`ul`/`table`, because base rules would reach backwards into the forty-odd
 * paragraphs already hand-classed on the PDP, cart and checkout and restyle
 * them. Opt-in has no blast radius.
 *
 * The measure is the variant: `policy` runs the spec's 760px column, `story`
 * the narrower 720px that --sz-container-narrow already names.
 */
const prose = cva(
  cn(
    "[&_p]:m-0 [&_p]:text-base [&_p]:leading-prose [&_p]:text-body [&_p]:[text-wrap:pretty]",
    "[&_p+p]:mt-[var(--sz-prose-gap)]",
    // The display face and heading colour come from the base layer; only the
    // size, weight and rhythm are the content pages' own.
    "[&_h2]:mt-[var(--sz-prose-section-gap)] [&_h2]:mb-3 [&_h2]:text-content-h2 [&_h2]:font-medium",
    // Anchors are offset past the sticky header, which measures its own height.
    "[&_h2]:scroll-mt-[var(--sz-anchor-offset)]",
    "[&_h3]:mt-[22px] [&_h3]:mb-2 [&_h3]:font-[family-name:var(--sz-font-ui)] [&_h3]:text-base [&_h3]:font-semibold",
    "[&_ul]:m-0 [&_ul]:mb-4 [&_ul]:ps-[var(--sz-prose-indent)] [&_ul]:text-base [&_ul]:leading-relaxed [&_ul]:text-body",
    "[&_li]:mb-[var(--sz-prose-gap-tight)]",
    "[&_strong]:font-semibold [&_strong]:text-heading",
    // The first child never leads with its own top margin — the page header
    // above it already owns that spacing.
    "[&>*:first-child]:mt-0",
  ),
  {
    variants: {
      measure: {
        policy: "max-w-[var(--sz-prose-max)]",
        story: "max-w-[var(--sz-container-narrow)]",
        /** Fills its column — for prose already inside a constrained card. */
        full: "max-w-none",
      },
    },
    defaultVariants: { measure: "policy" },
  },
);

export interface ProseProps extends VariantProps<typeof prose> {
  children: ReactNode;
  className?: string;
}

export function Prose({ children, measure, className }: ProseProps) {
  return <div className={cn(prose({ measure }), className)}>{children}</div>;
}

export interface ProseTableProps {
  /** Two column headings. The spec's table is always two columns. */
  head: readonly [string, string];
  rows: readonly (readonly [string, string])[];
  className?: string;
}

/**
 * ProseTable — the two-column comparison table in Sazuna Policy.dc.html.
 *
 * A real <table>, not the spec's nested grid divs: the shipping and buyback
 * tables are tabular data, and a screen reader should be able to say "row 2,
 * Silver, 60%" rather than reading twelve unrelated cells in a line.
 *
 * The right column is mono and tabular-nums because it always carries a figure
 * — a percentage, a duration, a price band.
 */
export function ProseTable({ head, rows, className }: ProseTableProps) {
  return (
    <div
      className={cn(
        "my-4 overflow-x-auto rounded-[var(--sz-radius-md)] border border-line",
        className,
      )}
    >
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="bg-surface text-xs font-semibold text-muted">
            <th scope="col" className="px-3.5 py-2.5 font-semibold">
              {head[0]}
            </th>
            <th scope="col" className="border-l border-line px-3.5 py-2.5 font-semibold">
              {head[1]}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([left, right]) => (
            <tr key={left} className="border-t border-line-soft text-sm">
              <td className="px-3.5 py-2.5 text-body">{left}</td>
              <td className="border-l border-line-soft px-3.5 py-2.5 font-mono text-[length:var(--sz-text-spec-key)] text-body tabular-nums">
                {right}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
