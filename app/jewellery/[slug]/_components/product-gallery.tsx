"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { cn } from "@/lib/cn";

export interface ProductGalleryProps {
  images: string[];
  productName: string;
}

const SWIPE_THRESHOLD = 40;

/**
 * Product gallery — spec §Gallery (Sazuna Product Detail PDP.dc.html:99-134).
 *
 * A thumbnail rail beside a crossfading main image on desktop; below 980px the
 * rail gives way to dots drawn inside the image. Arrow keys step through it, as
 * does a horizontal swipe.
 *
 * The spec draws five images because its demo has five. Real products carry
 * between zero and three, so the rail, the dots and the swipe handling all
 * disappear when there is nothing to page through.
 */
export function ProductGallery({ images, productName }: ProductGalleryProps) {
  const [index, setIndex] = useState(0);
  const touchStart = useRef<number | null>(null);

  // No photography yet — the spec's own empty state rather than a blank frame.
  if (images.length === 0) {
    return (
      <div className="flex aspect-square flex-col items-center justify-center gap-3.5 rounded-[var(--sz-radius-gallery)] border border-line-soft bg-[repeating-linear-gradient(135deg,var(--sz-line-soft)_0_20px,var(--sz-surface)_20px_40px)]">
        <svg
          width="46"
          height="46"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="text-control-border"
        >
          <path d="M1 1l22 22" />
          <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34" />
          <path d="M9.5 9.5a3.5 3.5 0 0 0 4.9 4.9" />
        </svg>
        <span className="font-mono text-2xs uppercase tracking-[.12em] text-muted-soft">
          Photography in progress
        </span>
      </div>
    );
  }

  const multiple = images.length > 1;
  const step = (delta: number) =>
    setIndex((current) => (current + delta + images.length) % images.length);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Product gallery"
      tabIndex={multiple ? 0 : -1}
      onKeyDown={(event) => {
        if (!multiple) return;
        if (event.key === "ArrowRight") {
          event.preventDefault();
          step(1);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          step(-1);
        }
      }}
      className={cn(
        "grid gap-3.5",
        multiple
          ? "pdp-split:grid-cols-[var(--sz-pdp-thumbs)_minmax(0,1fr)]"
          : "grid-cols-1",
      )}
    >
      {multiple && (
        <div
          role="tablist"
          aria-label="Product images"
          className="hidden flex-col gap-2.5 pdp-split:flex"
        >
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Image ${i + 1}`}
              onClick={() => setIndex(i)}
              className={cn(
                "relative aspect-square cursor-pointer overflow-hidden rounded-[var(--sz-radius-thumb)] border-[1.5px] p-0 transition-colors duration-[var(--sz-dur-fast)]",
                i === index ? "border-primary-700" : "border-line hover:border-accent",
              )}
              style={{
                background:
                  "radial-gradient(120% 120% at 30% 25%, var(--sz-media-from), var(--sz-media-to))",
              }}
            >
              <Image src={src} alt="" fill sizes="74px" className="object-cover" />
            </button>
          ))}
        </div>
      )}

      <div
        onTouchStart={(event) => {
          touchStart.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          if (touchStart.current === null || !multiple) return;
          const end = event.changedTouches[0]?.clientX ?? touchStart.current;
          const delta = end - touchStart.current;
          touchStart.current = null;
          if (Math.abs(delta) > SWIPE_THRESHOLD) step(delta < 0 ? 1 : -1);
        }}
        className="relative aspect-square overflow-hidden rounded-[var(--sz-radius-gallery)] bg-surface"
      >
        {images.map((src, i) => (
          // Every frame stays mounted and crossfades on opacity, so paging is
          // instant rather than re-requesting an image on each step.
          <div
            key={src}
            aria-hidden={i !== index}
            className="absolute inset-0 transition-opacity duration-[400ms] ease-linear"
            style={{
              opacity: i === index ? 1 : 0,
              background:
                "radial-gradient(120% 120% at 30% 25%, var(--sz-media-from), var(--sz-media-to))",
            }}
          >
            <Image
              src={src}
              alt={i === 0 ? productName : `${productName} — view ${i + 1}`}
              fill
              priority={i === 0}
              sizes="(max-width: 980px) 100vw, 45vw"
              className="object-cover"
            />
          </div>
        ))}

        {multiple && (
          <div
            role="tablist"
            aria-label="Choose image"
            className="absolute inset-x-0 bottom-3 flex justify-center pdp-split:hidden"
          >
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-[rgb(var(--sz-canvas-rgb)/.82)] px-2.5 py-1.5 backdrop-blur-[4px]">
              {images.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  aria-label={`Image ${i + 1}`}
                  onClick={() => setIndex(i)}
                  className="flex cursor-pointer items-center px-[3px] py-1.5"
                >
                  <span
                    className={cn(
                      "h-[var(--sz-gallery-dot-h)] rounded-pill transition-[width,background-color] duration-[var(--sz-dur-slow)] ease-[var(--sz-ease-out)]",
                      i === index
                        ? "w-[var(--sz-gallery-dot-w)] bg-primary-700"
                        : "w-[var(--sz-gallery-dot-w-idle)] bg-control-track",
                    )}
                  />
                </button>
              ))}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
