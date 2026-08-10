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
      {/* Three tracks rather than a centred flex row with the dismiss button
          floating over it. Absolutely positioned, that button reserved no space
          in the row, so at 375px any message wider than ~291px slid underneath
          it. The two outer tracks are equal, so the message stays centred while
          the right one holds the button. */}
      <div className="mx-auto grid h-[var(--sz-ann-h)] max-w-[var(--sz-container)] grid-cols-[1fr_auto_1fr] items-center px-[var(--sz-gutter-mobile)] nav-expanded:px-[var(--sz-gutter)]">
        <div className="col-start-2 flex min-w-0 items-center justify-center gap-4">
          <p className="m-0 flex min-h-5 min-w-0 items-center gap-[9px]">
            <span aria-hidden="true" className="size-1.5 shrink-0 rotate-45 bg-accent" />
            {/* The copy is admin-editable and unbounded. The strip is one line
                tall by design and clips whatever overflows, so long copy ends
                in an ellipsis instead of being sliced through the middle — the
                full sentence is still in the DOM for a screen reader. */}
            <span className="truncate font-mono text-2xs uppercase tracking-eyebrow text-ann-text">
              {message}
            </span>
          </p>

          {messages.length > 1 && (
            <span aria-hidden="true" className="flex shrink-0 items-center gap-[5px]">
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
        </div>

        <button
          type="button"
          aria-label="Dismiss announcements"
          onClick={() => setDismissed(true)}
          // The negative margin cancels the button's own padding, so the glyph
          // — not its box — lines up with the gutter, as it did when it was
          // positioned by hand.
          className="col-start-3 -mr-1 inline-flex cursor-pointer justify-self-end p-1 text-ann-dismiss transition-colors duration-[var(--sz-dur-fast)] hover:text-ann-text"
        >
          <Icon name="close" size={16} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}
