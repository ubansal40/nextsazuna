"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";

export interface TocEntry {
  id: string;
  label: string;
}

/**
 * "On this page" — Sazuna Policy.dc.html §policy.
 *
 * Renders both arrangements and lets the breakpoint choose: a sticky rail
 * beside the prose from 860px up, a disclosure above it below. Two DOM copies
 * of six links is cheaper than a resize listener that has to guess which one to
 * mount, and it means the links are in the markup either way.
 *
 * The disclosure is a real <details>, so it opens without JavaScript and
 * announces its state to a screen reader for free.
 */
export function PolicyToc({ entries }: { entries: TocEntry[] }) {
  const [activeId, setActiveId] = useState(entries[0]?.id ?? "");
  const disclosure = useRef<HTMLDetailsElement>(null);

  /**
   * A heading is current once it has scrolled up to where an anchor jump would
   * park it. Measured from the live header rather than the spec's flat 130px:
   * the announcement bar collapses on scroll, so the header is not one height.
   */
  const threshold = useRef(130);

  const measure = useCallback(() => {
    const header = getComputedStyle(document.documentElement).getPropertyValue("--sz-header-h");
    const parsed = Number.parseFloat(header);
    threshold.current = (Number.isFinite(parsed) ? parsed : 77) + 53;
  }, []);

  useEffect(() => {
    let frame = 0;

    const sync = () => {
      frame = 0;
      measure();

      let current = entries[0]?.id ?? "";
      for (const entry of entries) {
        const el = document.getElementById(entry.id);
        if (el && el.getBoundingClientRect().top <= threshold.current) current = entry.id;
      }
      // Only ever set on a scroll or resize frame, never synchronously from the
      // effect body — that would fight React's own render pass.
      setActiveId((previous) => (previous === current ? previous : current));
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(sync);
    };

    // Deferred so the first measurement lands after paint, once the header has
    // published its measured height.
    frame = requestAnimationFrame(sync);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [entries, measure]);

  const eyebrowClass =
    "font-mono text-eyebrow uppercase tracking-[var(--sz-tracking-caps)] text-accent-strong";

  return (
    <>
      {/* Rail — from 860px up. */}
      <aside
        aria-label="On this page"
        className="sticky top-[var(--sz-toc-top)] policy-stacked:hidden"
      >
        <p className={cn("m-0 mb-3.5", eyebrowClass)}>On this page</p>
        <nav className="flex flex-col border-s border-line">
          {entries.map((entry) => {
            const active = entry.id === activeId;
            return (
              <a
                key={entry.id}
                href={`#${entry.id}`}
                aria-current={active ? "location" : undefined}
                className={cn(
                  "-ms-px border-s-2 py-2 ps-3.5 text-toc leading-snug no-underline",
                  "transition-colors duration-[var(--sz-dur-fast)]",
                  active
                    ? "border-primary-700 font-semibold text-primary-700"
                    : "border-transparent text-muted hover:text-primary-700 hover:no-underline",
                )}
              >
                {entry.label}
              </a>
            );
          })}
        </nav>
      </aside>

      {/* Disclosure — below 860px. */}
      <details
        ref={disclosure}
        className="group mb-6 overflow-hidden rounded-[var(--sz-radius-md)] border border-line bg-raised policy-split:hidden"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2.5 px-4 py-3.5 text-control-sm font-semibold text-heading marker:hidden [&::-webkit-details-marker]:hidden">
          On this page
          <Icon
            name="chevron-down"
            size={16}
            className="shrink-0 text-muted transition-transform duration-[var(--sz-dur-condense)] ease-[var(--sz-ease-out)] group-open:rotate-180"
          />
        </summary>
        <nav className="flex flex-col px-4 pb-3.5">
          {entries.map((entry) => (
            <a
              key={entry.id}
              href={`#${entry.id}`}
              // The panel has done its job once a link is taken; leaving it open
              // means landing on the heading with the menu still covering it.
              onClick={() => disclosure.current?.removeAttribute("open")}
              className="py-2.5 text-control-sm text-body no-underline min-h-10 hover:no-underline"
            >
              {entry.label}
            </a>
          ))}
        </nav>
      </details>
    </>
  );
}
