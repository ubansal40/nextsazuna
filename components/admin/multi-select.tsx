"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * A checkable multi-select popover — the tag picker from Sazuna Admin's product
 * card, made reusable (categories use it too, since a product sits in several).
 * A button shows the chosen chips and opens a `listbox` of options; selecting
 * toggles. Closes on outside pointer-down and Escape.
 */
export interface MultiSelectOption {
  value: string;
  label: string;
}

/* The popover's own box, as numbers, so the open direction can be settled
 * before the list is on screen. */
const LIST_MAX_H = 256; // the `max-h-64` this replaces
const LIST_MIN_H = 120; // the shortest list worth showing, and so the flip threshold
const LIST_GAP = 4; // the 4px offset from the button
const LIST_PAD = 12; // p-1.5, top and bottom
const OPTION_H = 36; // min-h-9
const VIEWPORT_EDGE = 8; // never sit flush against the viewport edge

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Select…",
  ariaLabel,
}: {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  /** Where the list opened, decided on the click that opened it. */
  const [placement, setPlacement] = useState({ up: false, maxHeight: LIST_MAX_H });
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selectedSet = new Set(selected);
  const chips = options.filter((o) => selectedSet.has(o.value));
  const toggle = (value: string) =>
    onChange(selectedSet.has(value) ? selected.filter((v) => v !== value) : [...selected, value]);

  /**
   * Open the list where there is room for it.
   *
   * It used to open downward unconditionally at `z-30` — the same z-index as
   * the product editor's opaque `fixed bottom-0` save footer, and earlier in
   * the DOM, so on the lower half of a card the footer painted over the options
   * and they could not be clicked. The flip handles the viewport edge and the
   * raised z-index handles the footer; the height is clamped to whatever space
   * the chosen side actually has.
   *
   * Measured once, here, rather than in a layout effect: no extra render, no
   * resize listener, and nothing to keep in sync while the list is open.
   */
  function toggleOpen() {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const wanted = Math.min(LIST_MAX_H, options.length * OPTION_H + LIST_PAD);
      const below = window.innerHeight - rect.bottom - LIST_GAP - VIEWPORT_EDGE;
      const above = rect.top - LIST_GAP - VIEWPORT_EDGE;
      const up = below < Math.min(wanted, LIST_MIN_H) && above > below;
      setPlacement({ up, maxHeight: Math.max(LIST_MIN_H, Math.min(wanted, up ? above : below)) });
    }
    setOpen(true);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className="flex min-h-10 w-full items-center gap-1.5 rounded-[var(--sz-admin-radius-control)] border border-line bg-admin-canvas px-2.5 py-1.5 text-left text-[13px] text-body hover:border-accent"
      >
        <span className="flex flex-1 flex-wrap gap-1">
          {chips.length > 0 ? (
            chips.map((c) => (
              <span key={c.value} className="rounded-pill bg-primary-50 px-2 py-0.5 text-[11.5px] font-medium text-primary-700">
                {c.label}
              </span>
            ))
          ) : (
            <span className="text-muted">{placeholder}</span>
          )}
        </span>
        <Icon name="chevron-down" size={14} className={cn("shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          style={{ maxHeight: placement.maxHeight }}
          className={cn(
            "absolute left-0 z-40 w-full overflow-y-auto rounded-[10px] border border-line bg-raised p-1.5 shadow-[var(--sz-shadow-dropdown)]",
            placement.up ? "bottom-[calc(100%+4px)]" : "top-[calc(100%+4px)]",
          )}
        >
          {options.length === 0 && <p className="px-2.5 py-2 text-[12.5px] text-muted">Nothing to choose.</p>}
          {options.map((o) => {
            const on = selectedSet.has(o.value);
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => toggle(o.value)}
                className="flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] text-body hover:bg-admin-canvas"
              >
                <span
                  className={cn(
                    "inline-flex size-4 shrink-0 items-center justify-center rounded border",
                    on ? "border-primary-700 bg-primary-700 text-white" : "border-line",
                  )}
                >
                  {on && <Icon name="check" size={12} strokeWidth={3} />}
                </span>
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
