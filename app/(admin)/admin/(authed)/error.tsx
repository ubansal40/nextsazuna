"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui";

/**
 * The admin's error boundary — every screen inside the shell.
 *
 * There was none, so anything that escaped a screen — a render fault, or a
 * Server Action that rejected inside a transition — fell through to Next's bare
 * "Application error" page and took the sidebar with it. This boundary sits
 * inside the `(authed)` layout rather than around it, so the shell stays and
 * the admin can still navigate away.
 *
 * `retry`, not `reset`: it re-fetches the segment from the server before
 * re-rendering it (stable in Next 16.3), so a transient database or network
 * fault recovers without a full reload, where `reset` would re-render the same
 * failed payload.
 *
 * The screens settle their own action calls and keep their drafts
 * (components/admin/taxonomy/settle.ts); this is the last line, for what they
 * did not anticipate — which is why the copy is honest that unsaved typing on
 * the failed screen may be gone.
 */
export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[admin] a screen failed", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-[560px] py-10">
      <div role="alert" className="rounded-[var(--sz-admin-radius-card)] border border-error-border bg-raised px-5 py-6 text-center">
        <span className="inline-flex size-11 items-center justify-center rounded-pill bg-error-soft text-error">
          <Icon name="alert" size={20} />
        </span>
        <h2 className="mt-3 font-display text-lg font-medium text-heading">This screen hit a problem</h2>
        <p className="mx-auto mt-1.5 max-w-[46ch] text-[13px] leading-relaxed text-muted">
          Nothing that was already saved is affected. Anything typed here since the last save may need entering
          again.
        </p>
        {/* The digest is what matches this to the server log — the message itself
            is withheld in production. */}
        {error.digest && (
          <p className="mt-2 text-[11px] text-muted">
            If it keeps happening, quote reference <span className="font-mono">{error.digest}</span>.
          </p>
        )}
        <div className="mt-5 flex flex-wrap justify-center gap-2.5">
          <button
            type="button"
            onClick={retry}
            className="inline-flex min-h-10 items-center rounded-[var(--sz-admin-radius-control)] bg-primary-700 px-4 text-[13px] font-semibold text-white hover:bg-primary-800"
          >
            Try again
          </button>
          <Link
            href="/admin"
            className="inline-flex min-h-10 items-center rounded-[var(--sz-admin-radius-control)] border border-line px-4 text-[13px] font-semibold text-body no-underline hover:border-primary-700 hover:text-body hover:no-underline"
          >
            Back to the dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
