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
            "inline-flex items-center justify-center rounded-[var(--sz-radius-pill)] cursor-pointer",
            "text-primary-700/70 hover:text-primary-700 transition-colors duration-[var(--sz-dur-fast)]",
          )}
        >
          <Icon name="close" size={13} />
        </button>
      )}
    </span>
  );
}
