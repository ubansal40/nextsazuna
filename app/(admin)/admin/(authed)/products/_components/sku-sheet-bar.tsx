"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { SkuSheetStatus } from "@/lib/admin/sku-weights";

/**
 * The add-mode toolbar from Sazuna Admin Products.dc.html (`adx-xlbar`):
 * "Upload inventory Excel" with its live status, "Add product", and the
 * icon-only "Clear all cards".
 *
 * The status line is the point of the control. Autofill is invisible when it
 * works and baffling when it doesn't, so the bar always says which sheet is in
 * force and how many SKUs it holds — an admin typing a SKU that fills nothing
 * can then tell "this SKU isn't on the sheet" from "there is no sheet".
 *
 * One upload REPLACES the sheet (`POST /admin/products/sku-sheet`), which is
 * what the route does and what the old admin did.
 */

type Phase = "idle" | "uploading" | "error";

const ACCEPT = ".xlsx,.csv";
const MAX_BYTES = 12 * 1024 * 1024;

function statusText(phase: Phase, error: string | null, status: SkuSheetStatus): string {
  if (phase === "uploading") return "Reading inventory file…";
  if (phase === "error") return error ?? "Couldn't read that file — check the format and try again.";
  if (status.count > 0) {
    const from = status.fileName ? ` from ${status.fileName}` : "";
    return `Linked · ${status.count.toLocaleString("en-IN")} SKUs${from} — enter a SKU to autofill`;
  }
  return ".xlsx or .csv — weights & purity autofill by SKU";
}

export function SkuSheetBar({
  status,
  onStatusChange,
  onAddCard,
  onClearAll,
  clearDisabled,
}: {
  status: SkuSheetStatus;
  onStatusChange: (next: SkuSheetStatus) => void;
  onAddCard: () => void;
  onClearAll: () => void;
  clearDisabled: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    if (!/\.(xlsx|csv)$/i.test(file.name)) {
      setPhase("error");
      setError("Upload an .xlsx or .csv file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setPhase("error");
      setError("That file is over 12 MB.");
      return;
    }

    setPhase("uploading");
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/admin/products/sku-sheet", { method: "POST", body });
      const payload = (await response.json()) as
        | { ok: true; status: SkuSheetStatus; parsed: number; skipped: number }
        | { ok: false; error: string };

      if (!response.ok || !payload.ok) {
        setPhase("error");
        setError("error" in payload ? payload.error : "That file could not be read.");
        return;
      }
      onStatusChange(payload.status);
      setPhase("idle");
    } catch {
      setPhase("error");
      setError("The upload didn't finish. The previous sheet is unchanged.");
    }
  }

  const ok = phase === "idle" && status.count > 0;

  return (
    // .adx-xlbar
    <div className="mb-3 flex flex-wrap items-center gap-2.5">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(event) => {
          void upload(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      {/* .adx-xlmain */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={phase === "uploading"}
        aria-busy={phase === "uploading" || undefined}
        className="flex min-h-[52px] min-w-0 flex-1 items-center gap-2.5 rounded-[10px] border border-dashed border-line bg-raised px-3 py-[9px] text-left hover:border-primary-700 hover:bg-canvas disabled:cursor-progress disabled:opacity-[var(--sz-disabled-opacity)]"
      >
        {phase === "uploading" ? (
          <span className="size-4 shrink-0 animate-spin rounded-pill border-2 border-line border-t-primary-700" />
        ) : (
          <Icon
            name={phase === "error" ? "alert" : "box"}
            size={17}
            className={cn("shrink-0", phase === "error" ? "text-error" : ok ? "text-success" : "text-muted")}
          />
        )}
        <span className="min-w-0">
          <span className="block text-[12.5px] font-semibold text-body">Upload inventory Excel</span>
          <span
            role="status"
            aria-live="polite"
            className={cn(
              "block truncate text-[11px]",
              phase === "error" ? "text-error" : ok ? "text-success" : "text-muted",
            )}
          >
            {statusText(phase, error, status)}
          </span>
        </span>
      </button>

      {/* .adx-xladd — the spec's primary action on this bar */}
      <button
        type="button"
        onClick={onAddCard}
        className="inline-flex min-h-[52px] flex-none items-center justify-center gap-[7px] rounded-[var(--sz-admin-radius-control)] bg-primary-700 px-[15px] text-[12.5px] font-semibold text-white hover:bg-primary-800 max-[560px]:flex-1"
      >
        <Icon name="plus" size={15} strokeWidth={2} />
        Add product
      </button>

      {/* .adx-xlclear */}
      <button
        type="button"
        onClick={onClearAll}
        disabled={clearDisabled}
        aria-label="Clear all cards"
        title="Clear all cards"
        className="inline-flex size-[52px] flex-none items-center justify-center rounded-[var(--sz-admin-radius-control)] border border-line bg-raised text-muted hover:border-error-border hover:bg-error-soft hover:text-error disabled:opacity-[var(--sz-disabled-opacity)] disabled:hover:border-line disabled:hover:bg-raised disabled:hover:text-muted max-[560px]:size-[46px]"
      >
        <Icon name="trash" size={16} />
      </button>
    </div>
  );
}
