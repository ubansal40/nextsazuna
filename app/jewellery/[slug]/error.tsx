"use client";

import { Icon } from "@/components/ui";

/**
 * Route error state — spec lines 62-70.
 *
 * Next's error boundary is exactly the spec's "Error" page state, and `reset`
 * is its "Try again": it re-renders the segment rather than reloading, so a
 * transient database hiccup recovers without losing the reader's place.
 */
export default function JewelleryError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-[var(--sz-container)] px-10 pdp-narrow:px-5">
      <div className="mt-6 rounded-[var(--sz-radius-modal)] border border-line-soft bg-raised px-6 py-[90px] text-center">
        <span className="inline-flex size-[52px] items-center justify-center rounded-pill bg-primary-50 text-primary-700">
          <Icon name="alert" size={24} strokeWidth={1.8} />
        </span>
        <h1 className="m-0 mt-5 font-[family-name:var(--sz-font-display)] text-error-title font-medium text-heading">
          We couldn&rsquo;t load this piece
        </h1>
        <p className="mx-auto mt-2.5 max-w-[40ch] text-prose leading-[1.6] text-muted">
          Something went wrong on our side. Please try again in a moment.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-[26px] cursor-pointer rounded-[var(--sz-radius-thumb)] bg-primary-700 px-[26px] text-sm font-semibold text-white min-h-12 transition-colors duration-[var(--sz-dur-fast)] hover:bg-primary-800"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
