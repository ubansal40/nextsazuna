"use client";

import { cn } from "@/lib/cn";

/**
 * The reason and note every cancellation asks for.
 *
 * Shared because there are three ways to cancel — the detail page's "Cancel
 * order", a row's status dropdown and the bulk bar — and all three go through
 * `cancelOrders`, which will not cancel without a reason. Choosing "Cancelled"
 * from a dropdown used to skip this entirely and log a bare status change.
 */
export const CANCEL_REASONS = [
  "Customer changed their mind",
  "Out of stock",
  "Payment not received",
  "Duplicate order",
  "Delivery not possible",
  "Other",
];

export function CancelFields({
  reason,
  note,
  onReason,
  onNote,
}: {
  reason: string;
  note: string;
  onReason: (reason: string) => void;
  onNote: (note: string) => void;
}) {
  return (
    <>
      <label className="block">
        <span className={labelClass}>
          Cancellation reason <span className="text-error">*</span>
        </span>
        <select value={reason} onChange={(e) => onReason(e.target.value)} className={fieldClass}>
          {CANCEL_REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-3 block">
        <span className={labelClass}>Note · optional</span>
        <textarea
          value={note}
          onChange={(e) => onNote(e.target.value)}
          rows={2}
          placeholder="Anything the team should know"
          className={cn(fieldClass, "resize-y py-2")}
        />
      </label>
    </>
  );
}

const labelClass = "mb-1 block font-mono text-[9.5px] font-semibold uppercase tracking-[0.07em] text-muted";
const fieldClass =
  "min-h-11 w-full rounded-[var(--sz-admin-radius-control)] border border-line bg-admin-canvas px-2.5 text-[13px] text-body outline-none placeholder:text-muted focus-visible:border-primary-700";
