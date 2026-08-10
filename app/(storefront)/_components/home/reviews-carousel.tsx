"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui";
import type { Review } from "@/lib/homepage-blocks";

const AUTOPLAY_MS = 6200;

/**
 * Testimonials — spec §Testimonials (Sazuna Homepage.dc.html:266-313).
 *
 * Quotes crossfade inside a card sized by the longest of them. Same motion
 * rules as the hero: it stops for reduced motion, for the pointer, for keyboard
 * focus and for a hidden tab — plus, on touch, for good.
 */
export function ReviewsCarousel({ items }: { items: Review[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  /**
   * Stopped for good, kept separate from the transient `paused`.
   *
   * WCAG 2.2.2 wants a way to stop content that moves on its own, and hover was
   * the only one here — which is no mechanism at all on a touch screen, and
   * none for a keyboard either. Focus now pauses like the hero does, but focus
   * pairs with blur: folding a touch into `paused` would mean the next blur
   * silently restarted it. Someone who has reached into the carousel on a phone
   * is reading, not watching a slideshow, so that stop is permanent.
   */
  const [stopped, setStopped] = useState(false);

  const count = items.length;

  useEffect(() => {
    if (count < 2 || paused || stopped) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timer = setInterval(() => {
      if (document.hidden) return;
      setIndex((current) => (current + 1) % count);
    }, AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [count, paused, stopped]);

  const step = (delta: number) => setIndex((current) => (current + delta + count) % count);

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Testimonials"
      tabIndex={count > 1 ? 0 : -1}
      onKeyDown={(event) => {
        if (count < 2) return;
        if (event.key === "ArrowRight") {
          event.preventDefault();
          step(1);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          step(-1);
        }
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={() => setStopped(true)}
      className="relative mx-auto max-w-[860px] rounded-[var(--sz-radius-review)] border border-line bg-canvas px-11 py-[46px] [outline-offset:2px] home-narrow:px-6 home-narrow:py-8"
    >
      <span
        aria-hidden="true"
        className="absolute left-[34px] top-[22px] font-[family-name:var(--sz-font-display)] text-[70px] leading-none text-quote-mark"
      >
        &ldquo;
      </span>

      {/* A grid stack, not absolute slides. Every quote sits in the same cell,
          so they still overlap for the crossfade and the dots never jump — but
          the row is now as tall as the longest quote instead of a fixed 210px.
          `absolute inset-0` children cannot grow their box, so at 375px a
          moderate quote overran the card, `justify-center` spilling it evenly
          past the border and through the dots. The `min-h` stays: it is what
          holds the card's proportions when a quote is short. */}
      <div className="grid min-h-[210px]">
        {items.map((review, i) => (
          <figure
            key={review.quote}
            aria-hidden={i !== index}
            className={cn(
              "col-start-1 row-start-1 m-0 flex flex-col justify-center transition-opacity duration-[600ms] ease-linear",
              // Stacked means the topmost slide hit-tests for all of them, so a
              // hidden quote would be what a drag actually selects.
              i === index ? "pointer-events-auto" : "pointer-events-none",
            )}
            style={{ opacity: i === index ? 1 : 0 }}
          >
            <blockquote className="m-0">
              <p className="m-0 font-[family-name:var(--sz-font-display)] text-lg font-normal italic leading-[1.42] text-body [text-wrap:pretty]">
                {review.quote}
              </p>
            </blockquote>
            <figcaption className="mt-6 flex items-center gap-[13px]">
              <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-pill bg-primary-800 font-[family-name:var(--sz-font-display)] text-otp text-accent">
                {review.author.trim().charAt(0).toUpperCase()}
              </span>
              <span>
                <strong className="block text-control font-semibold text-heading">
                  {review.author}
                </strong>
                <span className="font-mono text-2xs text-muted">{review.subtext}</span>
              </span>
            </figcaption>
          </figure>
        ))}
      </div>

      {count > 1 && (
        <div className="mt-2.5 flex items-center justify-between">
          <div role="tablist" aria-label="Choose testimonial" className="flex gap-1.5">
            {items.map((review, i) => (
              <button
                key={review.quote}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Show testimonial ${i + 1}`}
                onClick={() => setIndex(i)}
                className="flex cursor-pointer items-center px-[5px] py-3"
              >
                <span
                  className={cn(
                    "block h-1.5 min-w-1.5 rounded-pill transition-[width,background-color] duration-[350ms] ease-[var(--sz-ease-out)]",
                    i === index ? "w-[30px] bg-accent" : "w-1.5 bg-control-track",
                  )}
                />
              </button>
            ))}
          </div>

          <div className="flex gap-[9px]">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous testimonial"
              className="inline-flex size-11 cursor-pointer items-center justify-center rounded-pill border border-line bg-raised text-primary-700 transition-colors duration-[var(--sz-dur-fast)] hover:border-primary-700"
            >
              <Icon name="chevron-left" size={18} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next testimonial"
              className="inline-flex size-11 cursor-pointer items-center justify-center rounded-pill border border-line bg-raised text-primary-700 transition-colors duration-[var(--sz-dur-fast)] hover:border-primary-700"
            >
              <Icon name="chevron-right" size={18} strokeWidth={1.8} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
