"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  defaultTab?: string;
  className?: string;
}

/**
 * Tabs — spec §Component · Overlays & navigation. Used for the PDP's
 * Specifications / Care / Story panels.
 *
 * Implements the WAI-ARIA tabs pattern including arrow-key roving focus, which
 * is the part hand-rolled tab bars almost always miss.
 */
export function Tabs({ items, defaultTab, className }: TabsProps) {
  const baseId = useId();
  const [active, setActive] = useState(defaultTab ?? items[0]?.id);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = items.findIndex((item) => item.id === active);
    if (index < 0) return;

    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % items.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else return;

    event.preventDefault();
    const target = items[next];
    setActive(target.id);
    document.getElementById(`${baseId}-tab-${target.id}`)?.focus();
  };

  return (
    <div className={className}>
      <div role="tablist" className="flex gap-6 border-b border-line">
        {items.map((item) => {
          const selected = item.id === active;
          return (
            <button
              key={item.id}
              id={`${baseId}-tab-${item.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(item.id)}
              onKeyDown={onKeyDown}
              className={cn(
                "relative -mb-px cursor-pointer border-b-2 pb-3 pt-1 text-sm font-semibold",
                "transition-colors duration-[var(--sz-dur)] ease-[var(--sz-ease-out)]",
                selected
                  ? "border-primary-700 text-primary-700"
                  : "border-transparent text-muted hover:text-body",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {items.map((item) => (
        <div
          key={item.id}
          id={`${baseId}-panel-${item.id}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${item.id}`}
          hidden={item.id !== active}
          tabIndex={0}
          className="pt-5 text-sm leading-[var(--sz-leading-relaxed)]"
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
