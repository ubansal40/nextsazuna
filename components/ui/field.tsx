import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";

/**
 * Label + helper + error scaffolding shared by every form control — spec
 * §Component · Input & forms. Controls own their own box; this owns the text
 * around it, so the label/helper/error rhythm is identical everywhere.
 */

export interface FieldProps {
  label?: ReactNode;
  /** Rendered under the control when there is no error. */
  helper?: ReactNode;
  /** Replaces the helper and switches the control to its error styling. */
  error?: ReactNode;
  /** Ties <label> to the control and wires aria-describedby. */
  htmlFor?: string;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

export function Field({
  label,
  helper,
  error,
  htmlFor,
  disabled = false,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cn("w-full", className)}>
      {label && (
        <label
          htmlFor={htmlFor}
          className={cn(
            "block text-[length:var(--sz-text-control-sm)] font-semibold mb-[7px]",
            disabled ? "text-muted" : "text-body",
          )}
        >
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p
          id={htmlFor ? `${htmlFor}-error` : undefined}
          className="flex items-center gap-1.5 text-xs text-error mt-[7px]"
        >
          <Icon name="alert" size={14} strokeWidth={1.8} />
          {error}
        </p>
      ) : (
        helper && (
          <p
            id={htmlFor ? `${htmlFor}-helper` : undefined}
            className="text-xs text-muted mt-[7px]"
          >
            {helper}
          </p>
        )
      )}
    </div>
  );
}

/** Shared box styling for input / select / textarea. */
export const controlBox = [
  "w-full text-[length:var(--sz-text-control)] text-body",
  "bg-raised border rounded-[var(--sz-radius-control)] px-[13px] py-[11px]",
  "placeholder:text-muted outline-none",
  "transition-[border-color,box-shadow] duration-[var(--sz-dur)] ease-[var(--sz-ease-out)]",
  "disabled:text-muted disabled:bg-surface disabled:border-line disabled:cursor-not-allowed",
].join(" ");

/** Border + ring for the resting/focus/error states. */
export function controlState(hasError: boolean) {
  return hasError
    ? "border-error shadow-[var(--sz-ring-error)] focus-visible:shadow-[var(--sz-ring-error)]"
    : "border-line focus-visible:border-primary-700 focus-visible:shadow-[var(--sz-ring-focus-soft)]";
}
