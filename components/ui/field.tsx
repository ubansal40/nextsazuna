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

/**
 * Shared box styling for input / select / textarea.
 *
 * `--sz-field-fs` publishes the designed size to the coarse-pointer floor in
 * globals.css. That rule cannot read the element's own font-size — `em` in the
 * `font-size` property is always parent-relative — so a control states it here.
 */
export const controlBox = [
  "w-full text-[length:var(--sz-text-control)] [--sz-field-fs:var(--sz-text-control)] text-body",
  "bg-raised border rounded-[var(--sz-radius-control)] px-[13px] py-[11px]",
  "placeholder:text-muted outline-none",
  "transition-[border-color,box-shadow] duration-[var(--sz-dur)] ease-[var(--sz-ease-out)]",
  "disabled:text-muted disabled:bg-surface disabled:border-line disabled:cursor-not-allowed",
].join(" ");

/**
 * Border + ring for the resting/focus/error states.
 *
 * Neither branch styles a focus ring: the global `:focus-visible` rule owns it,
 * and it is the only ring in the system measured against WCAG 2.4.11 (3.07:1 on
 * canvas — the soft ring this used to paint was 1.31:1, effectively invisible).
 *
 * The errored resting ring is scoped to `:not(:focus-visible)` rather than left
 * unconditional for the same reason. `controlBox` sets `outline-none`, and a
 * plain `shadow-*` utility sits in @layer utilities, which beats the global rule
 * in @layer base whatever its specificity — so an unconditional error shadow
 * swallowed the focus ring and an errored field had no focus indicator at all.
 * Dropping it while focused lets the global ring through; the error itself stays
 * signalled by `border-error` and the message under the field.
 */
export function controlState(hasError: boolean) {
  return hasError
    ? "border-error [&:not(:focus-visible)]:shadow-[var(--sz-ring-error)]"
    : "border-line focus-visible:border-primary-700";
}
