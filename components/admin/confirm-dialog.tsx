"use client";

import { useDialog } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * A confirm dialog on the native <dialog> — focus trapping, Escape and the
 * backdrop come from the platform via `useDialog`. Unlike the storefront `Modal`
 * (which hardcodes one `aria-labelledby` id and so collides when two mount),
 * this labels itself by rendering its heading inline, so any number can exist.
 *
 * Controlled: the parent owns `open` and the pending flag, because the confirm
 * usually kicks off a Server Action whose result the parent needs.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "primary",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { ref, onBackdropClick } = useDialog(open, onCancel);

  return (
    <dialog
      ref={ref}
      onClick={onBackdropClick}
      className="m-auto w-[min(400px,calc(100vw-32px))] rounded-[var(--sz-admin-radius-card)] border border-line bg-raised p-0 text-body shadow-[var(--sz-shadow-modal)] backdrop:bg-[var(--sz-overlay)]"
    >
      <div className="p-5">
        <h2 className="font-display text-lg font-medium text-heading">{title}</h2>
        {body && <div className="mt-2 text-[13.5px] leading-relaxed text-muted">{body}</div>}
        <div className="mt-5 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex min-h-11 items-center rounded-[var(--sz-admin-radius-control)] border border-line bg-raised px-4 text-[13px] font-semibold text-body hover:border-primary-700 disabled:opacity-[var(--sz-disabled-opacity)]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy || undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-[var(--sz-admin-radius-control)] px-4 text-[13px] font-semibold text-white disabled:cursor-progress disabled:opacity-[var(--sz-disabled-opacity)]",
              tone === "danger" ? "bg-error hover:bg-danger-hover" : "bg-primary-700 hover:bg-primary-800",
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
