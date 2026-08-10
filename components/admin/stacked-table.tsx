import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * An admin table that collapses into stacked cards on a phone — the `.adx-tbl`
 * pattern from the admin specs (`@media (max-width:760px)`: `thead` hidden,
 * every `tr` a bordered card, every `td` a label/value row whose label comes
 * from its own `data-label`).
 *
 * Three things are worth knowing before reusing this.
 *
 * 1. **It is written mobile-first, and that is deliberate.** The spec states the
 *    collapse as `max-width:760px`, which would pair with `min-width:761px` for
 *    the desktop half — two variants that must be kept complementary by hand,
 *    and Tailwind's `max-[760px]` compiles to `width < 760px`, leaving 760px
 *    itself in neither half. Making the card layout the unconditional base and
 *    restoring table semantics under a single `min-[761px]` gate means the two
 *    halves cannot drift apart or overlap: every width is in exactly one.
 *
 * 2. **The roles are stated, not decorative.** `display:block` on a table
 *    element drops its implicit ARIA role, so a collapsed table would otherwise
 *    reach a screen reader as anonymous boxes. Naming each element's own
 *    implicit role is a no-op above the breakpoint and restores the semantics
 *    below it. Each cell keeps its column name in text via the `::before`, which
 *    is what replaces the hidden `thead`.
 *
 * 3. **The card chrome and the horizontal scroller exist only above the
 *    breakpoint.** That is what makes this a fix rather than a restyle: the
 *    known defect on the taxonomy screens is a `min-width` table inside an
 *    `overflow-hidden` card, which clips the actions column out of reach on a
 *    phone. Here there is no scroller and no clipping box at phone width,
 *    because there is nothing left to scroll — the rows have become cards.
 *
 * Usage is ordinary table markup; only `thead`/`tr`/`th`/`td` are swapped:
 *
 * ```tsx
 * <StackedTable label="Orders" tableClassName="min-[761px]:min-w-[900px]">
 *   <StackedHead>
 *     <StackedTh className="w-10">…</StackedTh>
 *   </StackedHead>
 *   <StackedBody>
 *     <StackedRow selected={checked}>
 *       <StackedCell label="Order #">…</StackedCell>
 *     </StackedRow>
 *   </StackedBody>
 * </StackedTable>
 * ```
 */

export function StackedTable({
  children,
  className,
  tableClassName,
  label,
}: {
  children: ReactNode;
  className?: string;
  /**
   * Desktop-only sizing for the table itself — typically the `min-width` that
   * makes the columns legible before the scroller kicks in, e.g.
   * `"min-[761px]:min-w-[900px]"`. It must be a literal class string: a value
   * assembled at runtime is invisible to Tailwind's scanner and compiles to
   * nothing. It is deliberately NOT applied below the breakpoint, where a
   * min-width is exactly what would reintroduce the clipping.
   */
  tableClassName?: string;
  /** Names the table for assistive tech. */
  label?: string;
}) {
  return (
    <div
      className={cn(
        // No card, no scroller on a phone — each row carries its own border.
        "min-[761px]:overflow-x-auto min-[761px]:rounded-[var(--sz-admin-radius-card)] min-[761px]:border min-[761px]:border-line min-[761px]:bg-raised",
        className,
      )}
    >
      <table
        role="table"
        aria-label={label}
        className={cn("block w-full text-[13px] min-[761px]:table", tableClassName)}
      >
        {children}
      </table>
    </div>
  );
}

/** The header row. Hidden once the rows become cards — each cell labels itself. */
export function StackedHead({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <thead className={cn("hidden min-[761px]:table-header-group", className)}>
      <tr role="row" className="border-b border-line-soft text-left text-xs text-muted">
        {children}
      </tr>
    </thead>
  );
}

export function StackedTh({
  children,
  className,
  scope = "col",
}: {
  children?: ReactNode;
  className?: string;
  scope?: "col" | "row";
}) {
  return (
    <th role="columnheader" scope={scope} className={cn("px-3 py-2.5 font-medium", className)}>
      {children}
    </th>
  );
}

export function StackedBody({ children, className }: { children: ReactNode; className?: string }) {
  return <tbody className={cn("block min-[761px]:table-row-group", className)}>{children}</tbody>;
}

export function StackedRow({
  children,
  className,
  selected = false,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  /** Tints the row (or, on a phone, the card) the way the spec tints a selection. */
  selected?: boolean;
  /**
   * Anything else a `<tr>` takes, forwarded verbatim — in practice the HTML5
   * drag handlers the taxonomy screens put on a row. It is a passthrough rather
   * than a named `drag` prop because this component has no opinion about why a
   * row wants a DOM handler, and inventing one prop per use would make the
   * shared table grow a feature every time a screen needs an attribute.
   */
} & Omit<HTMLAttributes<HTMLTableRowElement>, "children" | "className">) {
  return (
    <tr
      role="row"
      {...rest}
      className={cn(
        // Phone: a card of its own.
        "mb-2.5 block rounded-[11px] border border-line px-[11px] py-[5px]",
        // Desktop: an ordinary row again. Only the bottom border survives, so
        // the sides and top are zeroed by name rather than by resetting all
        // four and hoping the shorthand lands in the right order.
        "min-[761px]:mb-0 min-[761px]:table-row min-[761px]:rounded-none min-[761px]:border-x-0 min-[761px]:border-t-0 min-[761px]:border-line-soft min-[761px]:p-0 min-[761px]:last:border-b-0",
        selected ? "bg-admin-canvas" : "bg-raised min-[761px]:bg-transparent",
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function StackedCell({
  children,
  label,
  className,
}: {
  children?: ReactNode;
  /**
   * The column name, repeated onto the cell so it can be shown beside the value
   * once the header is gone. Pass `""` for a column with no heading (an actions
   * column), which then renders as a plain right-aligned row.
   */
  label: string;
  className?: string;
}) {
  return (
    <td
      role="cell"
      data-label={label}
      className={cn(
        // Phone: label on the left, value on the right, hairline between fields.
        "flex items-center justify-between gap-3.5 border-b border-line-soft px-0 py-[7px] last:border-b-0",
        "before:text-[10.5px] before:font-semibold before:uppercase before:tracking-[.05em] before:text-muted before:content-[attr(data-label)]",
        // Desktop: an ordinary cell, and the label goes away with the pseudo-element.
        "min-[761px]:table-cell min-[761px]:border-b-0 min-[761px]:px-3 min-[761px]:py-2.5 min-[761px]:before:content-none",
        className,
      )}
    >
      {children}
    </td>
  );
}
