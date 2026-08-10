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

  // Optimistic value for the controlled case. Both consumers feed `value` from
  // server-priced state that only lands after a round trip, so a fully
  // controlled stepper recomputed every tap inside that window from the same
  // stale number and wrote the same absolute quantity — three quick taps landed
  // on 2 instead of 4, with nothing on screen to say a write was in flight.
  const [pending, setPending] = useState<number | null>(null);
  const [lastValue, setLastValue] = useState(value);

  // Reconciled during render rather than in an effect: this is an update to this
  // component's own state, so React re-runs the render before committing — no
  // second paint, no deps to keep, nothing to clean up. The optimistic number
  // survives only while the prop is still closing on it; once the prop settles
  // somewhere else — a stock clamp, a write that failed and rolled back — the
  // server wins, because showing a quantity it never agreed to is worse than
  // showing a tap that did not stick.
  if (value !== lastValue) {
    const catchingUp =
      pending !== null &&
      value !== undefined &&
      lastValue !== undefined &&
      Math.abs(pending - value) < Math.abs(pending - lastValue);
    setLastValue(value);
    if (!catchingUp) setPending(null);
  }

  const current = pending ?? value ?? internal;

  const set = (next: number) => {
    const clamped = Math.min(max, Math.max(min, next));
    if (value === undefined) setInternal(clamped);
    else setPending(clamped);
    onValueChange?.(clamped);
  };

  const step = cn(
    "relative inline-flex items-center justify-center",
    "size-[var(--sz-stepper-h)] text-primary-700 bg-raised cursor-pointer",
    "transition-colors duration-[var(--sz-dur)] ease-[var(--sz-ease-out)]",
    "hover:bg-primary-50",
    "disabled:cursor-not-allowed disabled:opacity-[var(--sz-disabled-opacity)] disabled:hover:bg-raised",
    // The drawn button is --sz-stepper-h (42px), two short of the 44px the
    // system names as a tap target. The hit area is grown with a pseudo-element
    // so the control keeps its measured width and height exactly: 44px centred
    // on a 42px button reaches 1px past it on each side, which is the
    // container's own border, so the target covers the control's outer box and
    // stops there.
    "before:absolute before:left-1/2 before:top-1/2 before:size-[var(--sz-control-h)]",
    "before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']",
  );

  return (
    <div
      className={cn(
        "inline-flex items-center border border-line rounded-[var(--sz-radius-control)]",
        className,
      )}
    >
      <button
        type="button"
        aria-label={`Decrease ${label.toLowerCase()}`}
        onClick={() => set(current - 1)}
        disabled={disabled || current <= min}
        // Rounded per button instead of clipped by the container: `overflow-
        // hidden` on the container would have cut both the 44px hit area and the
        // global focus ring back to the 42px box. --sz-radius-stepper is the
        // inner curve of --sz-radius-control over a 1px border.
        className={cn(step, "rounded-l-[var(--sz-radius-stepper)]")}
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
        className={cn(step, "rounded-r-[var(--sz-radius-stepper)]")}
      >
        <Icon name="plus" size={18} strokeWidth={1.8} />
      </button>
    </div>
  );
}
