"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/ui";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { cn } from "@/lib/cn";
import type { StockPlan } from "@/lib/admin/stock";

/**
 * Stock Management — Sazuna Admin Stock Management.dc.html.
 *
 * The spec's flow, and the reason for it: this one upload decides what the shop
 * sells. So the file is never applied on sight — it is checked first, the
 * damage is shown ("will move to draft" is the big, alarming number), and only
 * then can it be applied, behind a confirm.
 *
 * The file lives in this component and is posted twice, once per phase. That
 * keeps the server stateless between preview and apply: there is no half-open
 * sync to expire, resume, or leak to another admin.
 *
 * One spec branch is deliberately unbuilt: the result panel's "N products
 * couldn't be updated — locked by another edit". Our apply is a single atomic
 * CASE update, so it commits whole or rolls back whole and no partial state
 * exists to report. The spec drew a per-row apply; this is strictly safer.
 */

type Phase =
  | { kind: "idle" }
  | { kind: "chosen"; file: File }
  | { kind: "fileError"; title: string; body: string }
  | { kind: "busy"; file: File; step: string }
  | { kind: "preview"; file: File; plan: StockPlan }
  | { kind: "result"; fileName: string; plan: StockPlan }
  | { kind: "syncError"; file: File | null };

const ACCEPT = ".xlsx,.csv";
const MAX_BYTES = 12 * 1024 * 1024;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const n = (value: number) => value.toLocaleString("en-IN");

export function StockScreen() {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function chooseFile(file: File | undefined) {
    if (!file) return;
    if (!/\.(xlsx|csv)$/i.test(file.name)) {
      setPhase({ kind: "fileError", title: "That file type isn't supported", body: "Upload the inventory export as .xlsx or .csv." });
      return;
    }
    if (file.size > MAX_BYTES) {
      setPhase({ kind: "fileError", title: "That file is too large", body: `The limit is 12 MB — this one is ${formatSize(file.size)}.` });
      return;
    }
    setPhase({ kind: "chosen", file });
  }

  async function run(file: File, mode: "dry" | "apply") {
    setPhase({ kind: "busy", file, step: mode === "dry" ? "Reading the file and comparing it with the catalogue…" : "Applying the changes…" });
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("mode", mode);
      const response = await fetch("/admin/stock/sync", { method: "POST", body });
      const payload = (await response.json()) as { ok: boolean; plan?: StockPlan; error?: string };

      if (!response.ok || !payload.ok || !payload.plan) {
        // A 400 is the file's fault and the message names the fix; anything
        // else is ours, and gets the spec's "nothing was applied" panel.
        if (response.status === 400) {
          setPhase({ kind: "fileError", title: "That file couldn't be used", body: payload.error ?? "Check the file and try again." });
        } else {
          setPhase({ kind: "syncError", file });
        }
        return;
      }

      setPhase(
        mode === "dry"
          ? { kind: "preview", file, plan: payload.plan }
          : { kind: "result", fileName: file.name, plan: payload.plan },
      );
    } catch {
      setPhase({ kind: "syncError", file });
    }
  }

  function downloadUnmatched(plan: StockPlan) {
    const csv = ["sku", ...plan.unmatchedSkus.map((s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s))].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "unmatched-skus.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-[720px]">
      <div className="mb-4">
        <h2 className="font-display text-2xl font-medium text-heading">Stock Management</h2>
        <p className="mt-1 max-w-[56ch] text-[12.5px] text-muted">
          Upload the inventory export from your ERP. The site publishes what&rsquo;s in the file and drafts the rest.
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => {
          chooseFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {(phase.kind === "idle" || phase.kind === "chosen" || phase.kind === "fileError") && (
        <div className="rounded-[16px] border border-line bg-raised px-[22px] py-[26px]">
          <div className="text-center">
            <span className="inline-flex size-[54px] items-center justify-center rounded-pill bg-warning-soft text-accent-strong">
              <Icon name="box" size={24} />
            </span>
            <h3 className="mt-3 font-display text-xl font-medium text-heading">Upload an inventory file</h3>
            <p className="mt-1.5 font-mono text-[10.5px] tracking-[0.02em] text-muted">
              .xlsx or .csv · SKU in column A · up to 50,000 rows
            </p>
          </div>

          {phase.kind === "idle" && (
            <div
              role="group"
              aria-label="Drop an inventory file here"
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                chooseFile(e.dataTransfer.files?.[0]);
              }}
              className={cn(
                "mt-[18px] rounded-[13px] border-[1.5px] border-dashed px-4 py-[22px] text-center transition-colors",
                dragging ? "border-primary-700 bg-primary-50" : "border-line bg-canvas",
              )}
            >
              <p className="mb-3 text-[12.5px] text-muted">Drag a file here, or</p>
              <button type="button" onClick={() => inputRef.current?.click()} className={primaryButton}>
                <Icon name="plus" size={16} strokeWidth={2} /> Choose file
              </button>
            </div>
          )}

          {phase.kind === "chosen" && (
            <>
              <div className="mt-[18px] flex items-center gap-[11px] rounded-xl border border-line bg-canvas px-3 py-2.5">
                <span className="inline-flex size-[38px] shrink-0 items-center justify-center rounded-[9px] border border-line bg-raised text-primary-700">
                  <Icon name="receipt" size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-heading">{phase.file.name}</span>
                  <span className="mt-0.5 block font-mono text-[10.5px] text-muted">{formatSize(phase.file.size)}</span>
                </span>
                <button type="button" onClick={() => inputRef.current?.click()} className="min-h-11 shrink-0 px-1.5 text-[11.5px] font-semibold text-primary-700 underline">
                  Replace
                </button>
                <button
                  type="button"
                  onClick={() => setPhase({ kind: "idle" })}
                  aria-label="Remove file"
                  title="Remove file"
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-[9px] text-error hover:bg-error-soft"
                >
                  <Icon name="close" size={18} />
                </button>
              </div>
              <button type="button" onClick={() => void run(phase.file, "dry")} className={cn(primaryButton, "mt-3 w-full")}>
                Check this file
              </button>
            </>
          )}

          {phase.kind === "fileError" && (
            <>
              <div role="alert" className="mt-[18px] flex items-start gap-[11px] rounded-xl border border-error-border bg-error-soft px-3.5 py-3">
                <span className="mt-px shrink-0 text-error">
                  <Icon name="alert" size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-heading">{phase.title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted">{phase.body}</span>
                </span>
              </div>
              <button type="button" onClick={() => inputRef.current?.click()} className={cn(primaryButton, "mt-3 w-full")}>
                Choose another file
              </button>
            </>
          )}

          <div className="mt-4 flex items-start gap-2.5 border-t border-line-soft pt-[15px]">
            <span className="mt-px shrink-0 text-accent-strong">
              <Icon name="info" size={17} />
            </span>
            <p className="text-[12.5px] leading-relaxed text-body">
              Listed SKUs become <strong className="text-heading">Published</strong>. Everything else becomes{" "}
              <strong className="text-primary-700">Draft</strong>. Products marked{" "}
              <strong className="text-heading">Always available</strong> are exempt.
            </p>
          </div>
        </div>
      )}

      {phase.kind === "busy" && (
        <div className="flex min-h-[236px] flex-col justify-center rounded-[16px] border border-line bg-raised px-[22px] py-[26px]">
          <div className="flex items-center gap-[11px]">
            <span className="size-[34px] shrink-0 animate-spin rounded-pill border-[2.5px] border-line border-t-primary-700" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-heading">Checking the file</span>
              <span className="mt-0.5 block truncate font-mono text-[11px] text-muted">{phase.file.name}</span>
            </span>
          </div>
          <div role="status" aria-live="polite" className="mt-[18px] text-xs text-muted">
            {phase.step}
          </div>
        </div>
      )}

      {phase.kind === "preview" && (
        <div className="rounded-[16px] border border-line bg-raised px-[18px] py-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="rounded-[5px] bg-warning-soft px-1.5 py-[3px] font-mono text-[9.5px] font-semibold tracking-[0.1em] text-[var(--sz-admin-gold-ink)]">
              DRY RUN
            </span>
            <span className="min-w-0 truncate text-[13px] font-semibold text-heading">{phase.file.name}</span>
            <span className="font-mono text-[11px] text-muted">
              {n(phase.plan.skuCount)} SKU{phase.plan.skuCount === 1 ? "" : "s"} · {n(phase.plan.totalRows)} rows
            </span>
          </div>
          <p className="mb-4 mt-2 text-[12.5px] text-muted">Nothing has changed yet. This is what applying the file would do.</p>

          <div className="min-h-[96px] rounded-[13px] border-[1.5px] border-primary-200 bg-[var(--sz-primary-50)] px-4 py-[15px]">
            <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.1em] text-primary-700">Will move to draft</p>
            <p className="mt-1 font-mono text-[34px] font-semibold leading-tight tracking-[-0.03em] text-primary-700">{n(phase.plan.willDraft)}</p>
            <p className="mt-0.5 text-xs text-muted">
              of {n(phase.plan.governed)} products this sync governs · {n(phase.plan.draftedAfter)} would be draft in total
            </p>
          </div>

          <div className="mt-2.5 grid grid-cols-2 gap-2.5">
            <Tile label="Will publish" value={n(phase.plan.willPublish)} />
            <Tile label="Exempt" value={n(phase.plan.exempt)} note="Always available" />
            <div className="col-span-2">
              <Tile
                label="Unmatched SKUs"
                value={n(phase.plan.unmatched)}
                note={phase.plan.unmatched > 0 ? "Not found in the catalogue" : "Every SKU matched"}
                alarm={phase.plan.unmatched > 0}
              />
            </div>
          </div>

          {phase.plan.bigDraftWarning && (
            <div role="alert" className="mt-3 flex items-start gap-[11px] rounded-xl border border-error-border bg-error-soft px-3.5 py-3">
              <span className="mt-px shrink-0 text-error">
                <Icon name="alert" size={18} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-heading">This would draft {phase.plan.draftSharePct}% of the catalogue</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                  That usually means the export is partial or the SKU column is wrong. Check the file before applying.
                </span>
              </span>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2.5">
            <button type="button" onClick={() => setConfirming(true)} className={cn(primaryButton, "flex-[1_1_190px]")}>
              Apply changes
            </button>
            <button type="button" onClick={() => setPhase({ kind: "idle" })} className={secondaryButton}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {phase.kind === "result" && (
        <div className="rounded-[16px] border border-line bg-raised px-[18px] py-5">
          <div role="status" aria-live="polite" className="flex items-start gap-3">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-pill bg-success-soft text-success">
              <Icon name="check" size={20} strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <h3 className="font-display text-lg font-medium text-heading">Stock synced</h3>
              <p className="mt-1 break-words font-mono text-[11px] text-muted">{phase.fileName}</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <Tile label="Published" value={n(phase.plan.willPublish)} />
            <Tile label="Drafted" value={n(phase.plan.willDraft)} tone="primary" />
            <Tile label="Exempt" value={n(phase.plan.exempt)} />
            <Tile label="Unmatched" value={n(phase.plan.unmatched)} alarm={phase.plan.unmatched > 0} />
          </div>

          <div className="mt-[15px] min-h-[180px] overflow-hidden rounded-[13px] border border-line">
            <div className="flex flex-wrap items-center gap-2.5 border-b border-line-soft bg-canvas px-3 py-2.5">
              <span className="text-[12.5px] font-semibold text-heading">Unmatched SKUs</span>
              <span className="font-mono text-[11px] text-muted">
                {phase.plan.unmatched > phase.plan.unmatchedSkus.length
                  ? `showing ${n(phase.plan.unmatchedSkus.length)} of ${n(phase.plan.unmatched)}`
                  : n(phase.plan.unmatched)}
              </span>
              {phase.plan.unmatchedSkus.length > 0 && (
                <button
                  type="button"
                  onClick={() => downloadUnmatched(phase.plan)}
                  className="ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line bg-raised px-3 text-[11.5px] font-semibold text-primary-700 hover:border-primary-700 hover:bg-primary-50"
                >
                  <Icon name="arrow-right" size={14} className="rotate-90" /> Download .csv
                </button>
              )}
            </div>

            {phase.plan.unmatchedSkus.length > 0 ? (
              <div className="max-h-[250px] overflow-y-auto px-3 py-2.5">
                <ul className="grid grid-cols-2 gap-x-4 sm:grid-cols-3">
                  {phase.plan.unmatchedSkus.map((sku) => (
                    <li key={sku} className="truncate border-b border-line-soft py-1.5 font-mono text-[11.5px] text-body">
                      {sku}
                    </li>
                  ))}
                </ul>
                <p className="mt-2.5 text-[11.5px] text-muted">
                  These SKUs weren&rsquo;t found in the catalogue — usually a typo, or a product that hasn&rsquo;t been added yet.
                </p>
              </div>
            ) : (
              <div className="px-4 py-6 text-center">
                <span className="inline-flex size-9 items-center justify-center rounded-pill bg-success-soft text-success">
                  <Icon name="check" size={18} strokeWidth={2} />
                </span>
                <p className="mt-2 text-[13px] font-semibold text-heading">Every SKU matched</p>
                <p className="mx-auto mt-1 max-w-[34ch] text-xs text-muted">Nothing to fix — the whole file lined up with the catalogue.</p>
              </div>
            )}
          </div>

          <button type="button" onClick={() => setPhase({ kind: "idle" })} className={cn(primaryButton, "mt-[15px] w-full")}>
            Run another sync
          </button>
        </div>
      )}

      {phase.kind === "syncError" && (
        <div role="alert" className="min-h-[236px] rounded-[16px] border border-line bg-raised px-[22px] py-[34px] text-center">
          <span className="inline-flex size-12 items-center justify-center rounded-pill bg-error-soft text-error">
            <Icon name="alert" size={22} />
          </span>
          <h3 className="mt-3 font-display text-lg font-medium text-heading">The sync didn&rsquo;t finish</h3>
          <p className="mx-auto mt-1.5 max-w-[40ch] text-[12.5px] leading-relaxed text-muted">
            No changes were applied — the catalogue is exactly as it was. Try again, or upload the file once more.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2.5">
            {phase.file && (
              <button type="button" onClick={() => void run(phase.file!, "dry")} className={primaryButton}>
                Try again
              </button>
            )}
            <button type="button" onClick={() => setPhase({ kind: "idle" })} className={secondaryButton}>
              Start over
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        title="Apply this file?"
        tone="danger"
        confirmLabel="Apply changes"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          if (phase.kind === "preview") void run(phase.file, "apply");
        }}
        body={
          phase.kind === "preview" && (
            <>
              <strong className="text-body">{n(phase.plan.willDraft)}</strong> products will move to draft and{" "}
              <strong className="text-body">{n(phase.plan.willPublish)}</strong> will be published. Drafted products come
              off the storefront immediately.
            </>
          )
        }
      />
    </div>
  );
}

function Tile({
  label,
  value,
  note,
  tone = "ink",
  alarm = false,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "ink" | "primary";
  alarm?: boolean;
}) {
  return (
    <div className="min-h-[84px] rounded-xl border border-line px-3 py-3">
      <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.09em] text-muted">{label}</p>
      <p
        className={cn(
          "mt-1 font-mono text-[21px] font-semibold tracking-[-0.02em]",
          alarm || tone === "primary" ? "text-primary-700" : "text-heading",
        )}
      >
        {value}
      </p>
      {note && <p className="mt-0.5 text-[10.5px] text-muted">{note}</p>}
    </div>
  );
}

const primaryButton =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--sz-admin-radius-control)] bg-primary-700 px-4 text-[13.5px] font-semibold text-white hover:bg-primary-800";
const secondaryButton =
  "inline-flex min-h-12 shrink-0 items-center justify-center rounded-[var(--sz-admin-radius-control)] border border-line bg-raised px-4 text-[13.5px] font-semibold text-muted hover:border-accent";
