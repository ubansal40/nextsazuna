"use client";

import "./globals.css";
import { useEffect } from "react";
import { ErrorPage } from "@/components/content/error-page";
import { fontVariables } from "@/lib/fonts";

/**
 * The last-resort 500 — an error in a layout that no error.tsx sits beneath.
 *
 * `(storefront)/error.tsx` only catches what throws *below* the storefront
 * layout; the layout's own reads, and the root layout, land here. Without this
 * file that was Next's bare black-and-white page.
 *
 * It replaces the root layout while it is showing, so it brings its own
 * <html>, <body>, stylesheet and fonts, and it draws no shell: the shell is
 * the likeliest thing to have failed. The way home is a plain <a>, not <Link>,
 * so it is a fresh document load rather than another render of whatever just
 * broke.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" className={fontVariables}>
      <body>
        <title>Something went wrong · Sazuna Jewellers</title>
        <main>
          <ErrorPage
            code="Error 500"
            title="Something went wrong at our end."
            blurb="This is not your connection — it is us. The problem has been logged and someone is looking at it. Please try again in a moment."
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
                onClick={() => retry()}
                className="inline-flex min-h-[var(--sz-control-h-lg)] cursor-pointer items-center justify-center rounded-[var(--sz-radius-control)] bg-primary-700 px-[26px] text-control font-semibold text-white transition-colors duration-[var(--sz-dur-fast)] hover:bg-primary-800"
              >
                Try again
              </button>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full load, on purpose; see above */}
              <a
                href="/"
                className="inline-flex min-h-[var(--sz-control-h-lg)] items-center justify-center rounded-[var(--sz-radius-control)] border border-line bg-raised px-[26px] text-control font-semibold text-primary-700 no-underline hover:border-primary-700 hover:no-underline"
              >
                Back to Home
              </a>
            </div>
          </ErrorPage>
        </main>
      </body>
    </html>
  );
}
