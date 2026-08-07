"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui";

export interface AnnouncementBarProps {
  /** Messages from the `announcement_bar` content block, shown one at a time. */
  messages: string[];
  /** Whether the block asks for the messages to rotate on their own. */
  autoSlide?: boolean;
  /** Milliseconds each message stays up. */
  interval?: number;
}

/**
 * Announcement strip — spec §Announcement bar (SazunaHeader.dc.html:39-57).
 *
 * Oxblood-900 strip above the header. One message is up at a time with a dot
 * for each, and the whole strip collapses when dismissed. Content, cadence and
 * whether it rotates at all come from the `announcement_bar` content block, so
 * the copy is editable without a deploy.
 */
export function AnnouncementBar({ messages, autoSlide = true, interval = 3200 }: AnnouncementBarProps) {
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  /**
   * Rotate the message.
   *
   * Auto-advancing content is motion, so a reader who has asked for reduced
   * motion gets the first message and no carousel. Dismissing stops the timer
   * outright rather than rotating inside a collapsed strip.
   */
  useEffect(() => {
    if (!autoSlide || dismissed || messages.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % messages.length);
    }, interval);
    return () => clearInterval(timer);
  }, [autoSlide, dismissed, interval, messages.length]);

  // The index is derived from a list that can change under it when the admin
  // edits the block, so clamp rather than trusting it.
  const message = messages[index % messages.length];

  return (
    <div
      role="region"
      aria-label="Announcements"
      // Collapsed, the strip still occupies the DOM so the height can animate.
      // `inert` takes its dismiss button out of the tab order at the same time.
      inert={dismissed}
      className="overflow-hidden bg-primary-900"
      style={{
        maxHeight: dismissed ? 0 : "var(--sz-ann-h)",
        opacity: dismissed ? 0 : 1,
        transition:
          "max-height var(--sz-dur-ann) var(--sz-ease-out), opacity var(--sz-dur-ann-fade) ease",
      }}
    >
      <div className="relative mx-auto flex h-[var(--sz-ann-h)] max-w-[var(--sz-container)] items-center justify-center gap-4 px-[var(--sz-gutter-mobile)] nav-expanded:px-[var(--sz-gutter)]">
        <p className="m-0 flex min-h-5 items-center gap-[9px]">
          <span aria-hidden="true" className="size-1.5 rotate-45 bg-accent" />
          <span className="font-mono text-2xs uppercase tracking-eyebrow text-ann-text">
            {message}
          </span>
        </p>

        {messages.length > 1 && (
          <span aria-hidden="true" className="flex items-center gap-[5px]">
            {messages.map((label, dot) => (
              <span
                key={label}
                className={cn(
                  "h-[var(--sz-ann-dot-h)] rounded-[2px] transition-[width,background-color] duration-[var(--sz-dur)] ease-[var(--sz-ease-out)]",
                  dot === index
                    ? "w-[var(--sz-ann-dot-w)] bg-accent"
                    : "w-[var(--sz-ann-dot-w-idle)] bg-[rgb(var(--sz-accent-rgb)/.35)]",
                )}
              />
            ))}
          </span>
        )}

        <button
          type="button"
          aria-label="Dismiss announcements"
          onClick={() => setDismissed(true)}
          className="absolute right-[18px] top-1/2 inline-flex -translate-y-1/2 cursor-pointer p-1 text-ann-dismiss transition-colors duration-[var(--sz-dur-fast)] hover:text-ann-text nav-expanded:right-[34px]"
        >
          <Icon name="close" size={16} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}
