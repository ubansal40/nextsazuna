"use client";

import { ErrorHomeLink, ErrorPage } from "@/components/content/error-page";

/**
 * 500 — Sazuna Error Pages.dc.html.
 *
 * The root error boundary. `reset` re-renders the segment rather than reloading
 * the document, so a transient database hiccup recovers without the reader
 * losing their place — the same reason the PDP's boundary uses it.
 *
 * The bag reassurance is not decoration. The bag lives in localStorage
 * (lib/cart-storage), so it genuinely survives a server fault, and the one
 * thing someone fears when a shop 500s mid-checkout is that it did not.
 */
export default function RootError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorPage
      code="Error 500"
      title="Something went wrong at our end."
      blurb="This is not your connection and not your filters — it is us. The problem has been logged and someone is looking at it. Please try again in a moment."
      icon="alert"
      tone="fault"
      whatsappText="Hi, I hit an error on your site."
    >
      <p className="mx-auto mt-5 max-w-[46ch] rounded-[var(--sz-radius-md)] bg-warning-soft px-4 py-3 text-sm leading-relaxed text-body">
        Your bag is stored in this browser and is safe — nothing has been lost.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex cursor-pointer items-center justify-center rounded-[var(--sz-radius-control)] bg-primary-700 px-[26px] text-control font-semibold text-white min-h-[52px] transition-colors duration-[var(--sz-dur-fast)] hover:bg-primary-800"
        >
          Try again
        </button>
        <ErrorHomeLink variant="secondary" />
      </div>
    </ErrorPage>
  );
}
