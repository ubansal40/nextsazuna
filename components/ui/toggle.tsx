import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface ToggleProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className"> {
  label?: string;
  helper?: string;
  className?: string;
}

/**
 * Toggle — spec §Component · Input & forms.
 *
 * Backed by a real checkbox so it submits with a form and keeps native keyboard
 * and screen-reader behaviour; the visual is pure CSS driven off `peer-checked`,
 * which keeps this a Server Component unless the caller needs an onChange.
 */
export function Toggle({ label, helper, className, id, disabled, ...props }: ToggleProps) {
  return (
    <div className={className}>
      <label
        className={cn(
          "flex items-center gap-3 w-fit",
          disabled ? "cursor-not-allowed opacity-[var(--sz-disabled-opacity)]" : "cursor-pointer",
        )}
      >
        <input
          id={id}
          type="checkbox"
          role="switch"
          disabled={disabled}
          className="sr-only peer"
          {...props}
        />
        <span
          aria-hidden="true"
          className={cn(
            "relative shrink-0 w-[var(--sz-toggle-w)] h-[var(--sz-toggle-h)]",
            "rounded-[var(--sz-radius-pill)] bg-control-track",
            "transition-colors duration-[var(--sz-dur)] ease-[var(--sz-ease-out)]",
            "peer-checked:bg-primary-700",
            "peer-focus-visible:shadow-[var(--sz-focus-ring)]",
            // The knob is a descendant of this span, not a sibling of the input,
            // so peer-checked has to reach it through a child selector.
            "peer-checked:[&>span]:left-[23px]",
          )}
        >
          <span
            className={cn(
              "absolute top-[3px] left-[3px]",
              "size-[var(--sz-toggle-knob)] rounded-[var(--sz-radius-pill)] bg-raised",
              "transition-[left] duration-[var(--sz-dur)] ease-[var(--sz-ease-out)]",
            )}
          />
        </span>
        {label && <span className="text-sm text-body">{label}</span>}
      </label>
      {helper && <p className="text-xs text-muted mt-2">{helper}</p>}
    </div>
  );
}
