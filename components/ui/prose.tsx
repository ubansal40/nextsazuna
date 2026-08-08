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
/**
 * Every rule below is scoped with `:not([class])`, so Prose styles exactly the
 * elements that do not style themselves.
 *
 * Without it a descendant rule (`.prose p`, specificity 0,1,1) silently beats a
 * utility on the element itself (`.text-sm`, 0,1,0) — so a callout's smaller
 * paragraph would render at body size and no amount of class-shuffling at the
 * call site would fix it. This inverts that: bare markup gets the prose
 * treatment, anything carrying its own classes is left alone.
 */
const prose = cva(
  cn(
    "[&_p:not([class])]:m-0 [&_p:not([class])]:mb-[var(--sz-prose-gap)]",
    "[&_p:not([class])]:text-base [&_p:not([class])]:leading-prose",
    "[&_p:not([class])]:text-body [&_p:not([class])]:[text-wrap:pretty]",
    // Headings space themselves off what precedes them rather than resetting a
    // top margin on the first child. `* + h2` simply never matches the opening
    // heading, so it needs no override — and an override would lose anyway,
    // since a descendant rule out-specifies a first-child one.
    "[&_*+h2:not([class])]:mt-[var(--sz-prose-section-gap)]",
    "[&_*+h3:not([class])]:mt-[22px]",
    // The display face and heading colour come from the base layer; only the
    // size, weight and rhythm are the content pages' own.
    "[&_h2:not([class])]:mb-3 [&_h2:not([class])]:text-content-h2 [&_h2:not([class])]:font-medium",
    // Anchors clear the sticky header, which measures its own height.
    "[&_h2:not([class])]:scroll-mt-[var(--sz-anchor-offset)]",
    "[&_h3:not([class])]:mb-2 [&_h3:not([class])]:text-base",
    "[&_h3:not([class])]:font-[family-name:var(--sz-font-ui)] [&_h3:not([class])]:font-semibold",
    // Preflight resets list-style, so the marker has to be asked for back.
    "[&_ul:not([class])]:list-disc",
    "[&_ul:not([class])]:m-0 [&_ul:not([class])]:mb-4 [&_ul:not([class])]:text-base",
    "[&_ul:not([class])]:ps-[var(--sz-prose-indent)] [&_ul:not([class])]:leading-relaxed",
    "[&_ul:not([class])]:text-body [&_li:not([class])]:mb-[var(--sz-prose-gap-tight)]",
    "[&_strong]:font-semibold [&_strong]:text-heading",
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
  head: readonly ReactNode[];
  rows: readonly (readonly ReactNode[])[];
  className?: string;
}

/**
 * ProseTable — the comparison table in Sazuna Policy.dc.html.
 *
 * A real <table>, not the spec's nested grid divs: the shipping and buyback
 * tables are tabular data, and a screen reader should be able to announce "row
 * 2, Silver, 60% credit" rather than reading nine unrelated cells in a line.
 *
 * Columns are open-ended. The spec draws two because its demo data had two, but
 * shipping's real table is Region / Cut-off / Arrives. The last column keeps the
 * spec's mono treatment — across every table on the site it is the one carrying
 * the value, whether that is a percentage, a duration or a price band.
 *
 * The wrapper scrolls rather than the page: three columns of Nepali province
 * names do not fit 375px, and a horizontally scrolling body would take the
 * header and footer with it.
 */
export function ProseTable({ head, rows, className }: ProseTableProps) {
  const last = head.length - 1;

  return (
    <div
      className={cn(
        "my-4 overflow-x-auto rounded-[var(--sz-radius-md)] border border-line",
        className,
      )}
    >
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="bg-surface text-xs text-muted">
            {head.map((cell, column) => (
              <th
                key={column}
                scope="col"
                className={cn(
                  "px-3.5 py-2.5 font-semibold",
                  column > 0 && "border-l border-line",
                )}
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t border-line-soft text-sm">
              {row.map((cell, column) => (
                <td
                  key={column}
                  className={cn(
                    "px-3.5 py-2.5 text-body",
                    column > 0 && "border-l border-line-soft",
                    column === last &&
                      "font-mono text-[length:var(--sz-text-spec-key)] tabular-nums",
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
