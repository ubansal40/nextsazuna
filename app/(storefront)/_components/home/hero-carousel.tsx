"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui";
import type { HeroSlide } from "@/lib/homepage-blocks";

const SWIPE_THRESHOLD = 40;

/**
 * Hero carousel — spec §Hero (Sazuna Homepage.dc.html:55-102).
 *
 * Slides crossfade over a shared frame. It advances on its own, but stops for
 * anyone who has asked for reduced motion, while the pointer or focus is inside
 * it, or while the tab is hidden — an unattended carousel burning CPU in a
 * background tab helps nobody.
 */
export function HeroCarousel({ slides, autoplayMs }: { slides: HeroSlide[]; autoplayMs: number }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStart = useRef<number | null>(null);

  const count = slides.length;

  useEffect(() => {
    if (count < 2 || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timer = setInterval(() => {
      if (document.hidden) return;
      setIndex((current) => (current + 1) % count);
    }, autoplayMs);
    return () => clearInterval(timer);
  }, [count, paused, autoplayMs]);

  const step = (delta: number) => setIndex((current) => (current + delta + count) % count);

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Featured"
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
      onTouchStart={(event) => {
        touchStart.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        if (touchStart.current === null || count < 2) return;
        const end = event.changedTouches[0]?.clientX ?? touchStart.current;
        const delta = end - touchStart.current;
        touchStart.current = null;
        if (Math.abs(delta) > SWIPE_THRESHOLD) step(delta < 0 ? 1 : -1);
      }}
      className="relative flex min-h-[min(76vh,760px)] items-end overflow-hidden rounded-[var(--sz-radius-hero)] bg-[repeating-linear-gradient(135deg,var(--sz-hero-from)_0_18px,var(--sz-hero-to)_18px_36px)] [outline-offset:-3px] home-narrow:min-h-[68vh]"
    >
      {slides.map((slide, i) => (
        <div
          key={slide.headline}
          aria-hidden={i !== index}
          className={cn(
            "absolute inset-0 transition-opacity duration-[800ms] ease-linear",
            // Opacity is a paint property, not a hit-testing one: an invisible
            // slide still swallows every click landing on its full-bleed scrim,
            // and the last one in DOM order sits on top of the entire hero. Left
            // alone, tapping the visible CTA navigated to a *different* slide's
            // href. Hiding a slide has to take it out of hit-testing too.
            i === index ? "pointer-events-auto" : "pointer-events-none",
          )}
          style={{ opacity: i === index ? 1 : 0 }}
        >
          {/* Slide 0 is the homepage LCP element and asks to go first. The other
              slides are eager so autoplay never lands on a blank frame, but they
              must not compete with slide 0 for the first bytes. */}
          {slide.image && (
            <Image
              src={slide.image}
              alt=""
              fill
              {...(i === 0 ? { priority: true } : { loading: "eager" as const })}
              sizes="(max-width: 1360px) 100vw, 1280px"
              className="object-cover"
            />
          )}
          <div className="absolute inset-0 bg-[linear-gradient(to_top,rgb(var(--sz-hero-scrim-rgb)/.82),rgb(var(--sz-hero-scrim-rgb)/.30)_42%,rgb(var(--sz-hero-scrim-rgb)/.04)_70%)]" />

          <div className="absolute inset-x-0 bottom-0 px-14 pb-24 home-narrow:px-[22px]">
            <div className="max-w-[560px]">
              {slide.eyebrow && (
                <p className="m-0 mb-4 flex items-center gap-[9px] font-mono text-xs uppercase tracking-[var(--sz-tracking-hero)] text-ann-text">
                  <span aria-hidden="true" className="size-1.5 rotate-45 bg-accent" />
                  {slide.eyebrow}
                </p>
              )}
              {/* The first slide carries the page's h1; the rest are h2 so the
                  document does not present four competing top-level headings. */}
              {i === 0 ? (
                <h1 className="m-0 font-[family-name:var(--sz-font-display)] text-hero font-normal leading-[1.02] tracking-tight text-white [text-wrap:balance] home-narrow:text-hero-sm">
                  {slide.headline}
                </h1>
              ) : (
                <h2 className="m-0 font-[family-name:var(--sz-font-display)] text-hero font-normal leading-[1.02] tracking-tight text-white [text-wrap:balance] home-narrow:text-hero-sm">
                  {slide.headline}
                </h2>
              )}
              {slide.sub && (
                <p className="mb-7 mt-[18px] max-w-[46ch] text-hero-body leading-[1.5] text-hero-body">
                  {slide.sub}
                </p>
              )}
              {slide.cta && (
                <Link
                  href={slide.cta.href}
                  // Slides that are not showing must not be reachable by Tab.
                  tabIndex={i === index ? undefined : -1}
                  className="inline-flex h-[var(--sz-control-h-md)] items-center gap-[9px] rounded-[var(--sz-radius-thumb)] bg-primary-700 px-[26px] text-control font-semibold text-white no-underline transition-colors duration-[var(--sz-dur-fast)] hover:bg-primary-800 hover:text-white hover:no-underline"
                >
                  {slide.cta.text}
                  <Icon name="arrow-right" size={15} strokeWidth={1.9} />
                </Link>
              )}
            </div>
          </div>
        </div>
      ))}

      {count > 1 && (
        <div
          role="tablist"
          aria-label="Choose slide"
          className="absolute inset-x-0 bottom-[22px] flex gap-1 px-14 home-narrow:px-[22px]"
        >
          {slides.map((slide, i) => (
            <button
              key={slide.headline}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Show slide ${i + 1}`}
              onClick={() => setIndex(i)}
              className="flex cursor-pointer items-center py-[15px] pl-0 pr-1.5"
            >
              <span
                className={cn(
                  "block h-1.5 min-w-1.5 rounded-pill transition-[width,background-color] duration-[350ms] ease-[var(--sz-ease-out)]",
                  i === index ? "w-[30px] bg-accent" : "w-2 bg-[rgb(255_255_255/.55)]",
                )}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
