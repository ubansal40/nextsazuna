"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";

export interface QuantityStepperProps {
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  /** Accessible name, e.g. "Quantity for Solitaire Halo Ring". */
  label?: string;
  className?: string;
}

/**
 * Quantity stepper — spec §Component · Input & forms.
 * Controlled when `value` is supplied, uncontrolled otherwise.
 */
export function QuantityStepper({
  value,
  defaultValue = 1,
  onValueChange,
  min = 1,
  max = 99,
  disabled = false,
  label = "Quantity",
  className,
}: QuantityStepperProps) {
  const [internal, setInternal] = useState(defaultValue);
  const current = value ?? internal;

  const set = (next: number) => {
    const clamped = Math.min(max, Math.max(min, next));
    if (value === undefined) setInternal(clamped);
    onValueChange?.(clamped);
  };

  const step = cn(
    "inline-flex items-center justify-center",
    "size-[var(--sz-stepper-h)] text-primary-700 bg-raised cursor-pointer",
    "transition-colors duration-[var(--sz-dur)] ease-[var(--sz-ease-out)]",
    "hover:bg-primary-50",
    "disabled:cursor-not-allowed disabled:opacity-[var(--sz-disabled-opacity)] disabled:hover:bg-raised",
  );

  return (
    <div
      className={cn(
        "inline-flex items-center border border-line rounded-[var(--sz-radius-control)] overflow-hidden",
        className,
      )}
    >
      <button
        type="button"
        aria-label={`Decrease ${label.toLowerCase()}`}
        onClick={() => set(current - 1)}
        disabled={disabled || current <= min}
        className={step}
      >
        <Icon name="minus" size={18} strokeWidth={1.8} />
      </button>
      <output
        aria-live="polite"
        aria-label={label}
        className={cn(
          "w-[52px] text-center font-mono text-[length:var(--sz-text-control)] text-heading",
          "border-x border-line leading-[var(--sz-stepper-h)] tabular-nums",
        )}
      >
        {current}
      </output>
      <button
        type="button"
        aria-label={`Increase ${label.toLowerCase()}`}
        onClick={() => set(current + 1)}
        disabled={disabled || current >= max}
        className={step}
      >
        <Icon name="plus" size={18} strokeWidth={1.8} />
      </button>
    </div>
  );
}
