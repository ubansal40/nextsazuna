import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className"> {
  label?: string;
  helper?: string;
  className?: string;
}

/**
 * Checkbox — spec §Component · Input & forms.
 * Native input + CSS-driven visual, same rationale as Toggle.
 */
export function Checkbox({ label, helper, className, id, disabled, ...props }: CheckboxProps) {
  return (
    <div className={className}>
      <label
        className={cn(
          "flex items-center gap-[11px] w-fit",
          disabled ? "cursor-not-allowed opacity-[var(--sz-disabled-opacity)]" : "cursor-pointer",
        )}
      >
        <input id={id} type="checkbox" disabled={disabled} className="sr-only peer" {...props} />
        <span
          aria-hidden="true"
          className={cn(
            "relative shrink-0 inline-flex items-center justify-center",
            "size-[var(--sz-checkbox)] rounded-[var(--sz-radius-sm)]",
            "bg-raised border border-control-border",
            "transition-colors duration-[var(--sz-dur)] ease-[var(--sz-ease-out)]",
            "peer-checked:bg-primary-700 peer-checked:border-primary-700",
            "peer-focus-visible:shadow-[var(--sz-focus-ring)]",
            "peer-checked:[&>svg]:opacity-100",
          )}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-white opacity-0 transition-opacity duration-[var(--sz-dur-fast)]"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
        {label && <span className="text-sm text-body">{label}</span>}
      </label>
      {helper && <p className="text-xs text-muted mt-2">{helper}</p>}
    </div>
  );
}
