import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";

export interface ChipProps extends Omit<HTMLAttributes<HTMLSpanElement>, "onRemove"> {
  children: ReactNode;
  /** Renders the × affordance. Omit for a static chip. */
  onRemove?: () => void;
  /** Accessible name for the remove button; defaults to "Remove <children>". */
  removeLabel?: string;
}

/**
 * Filter chip — spec §Component · Badge & chip ("applied filters · removable").
 * Tighter right padding when removable so the × sits on the same optical margin.
 */
export function Chip({ children, onRemove, removeLabel, className, ...props }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-primary-700",
        "bg-primary-50 border border-primary-200 rounded-[var(--sz-radius-pill)]",
        onRemove ? "pl-[13px] pr-2 py-1.5" : "px-[13px] py-1.5",
        className,
      )}
      {...props}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel ?? `Remove ${typeof children === "string" ? children : "filter"}`}
          className={cn(
            "relative inline-flex items-center justify-center rounded-[var(--sz-radius-pill)] cursor-pointer",
            "text-primary-700/70 hover:text-primary-700 transition-colors duration-[var(--sz-dur-fast)]",
            // Preflight zeroes button padding, so the button's box is exactly
            // the 13px glyph — half the 24x24 WCAG 2.5.8 asks for. The target is
            // grown with a pseudo-element rather than padding or a bigger box,
            // both of which would widen the chip. 24 and not --sz-control-h
            // (44px): a 44px target on a 13px glyph would spill past the chip
            // and overlap its neighbours in a wrapped filter row, which trades
            // one mis-tap for another. The button's own box still hits too, so
            // the effective target is the union of the two.
            "before:absolute before:left-1/2 before:top-1/2 before:size-[var(--sz-tap-min)]",
            "before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']",
          )}
        >
          <Icon name="close" size={13} />
        </button>
      )}
    </span>
  );
}
