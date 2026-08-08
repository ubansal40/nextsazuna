"use client";

import { cn } from "@/lib/cn";

/**
 * A `role="switch"` toggle — the visibility control across the taxonomy screens.
 * Controlled; the parent owns the value and persists the change.
 */
export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-pill transition-colors disabled:opacity-[var(--sz-disabled-opacity)]",
        checked ? "bg-primary-700" : "bg-line",
      )}
    >
      <span
        className={cn(
          "inline-block size-4 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
