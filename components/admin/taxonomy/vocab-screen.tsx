"use client";

import { useState, useTransition } from "react";
import { Icon, useToast } from "@/components/ui";
import { Switch } from "@/components/admin/switch";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { cn } from "@/lib/cn";
import type { TaxonomyCounts, VocabKind, VocabRow } from "@/lib/admin/taxonomy";
import { TaxonomyTabs } from "./taxonomy-tabs";
import {
  addVocab,
  renameVocabAction,
  setVocabVisibilityAction,
  deleteVocabAction,
  reorderVocabAction,
  type VocabResult,
} from "@/app/(admin)/admin/(authed)/materials/_actions";

/**
 * Materials & Purities — the managed vocabulary screen from Sazuna Admin
 * Taxonomy.dc.html. A reorderable table (each row: name, live product count, a
 * visibility switch, rename and delete), with an inline add at the foot. Both
 * vocabularies share this one screen, differing only by `kind`.
 *
 * Every mutation returns the refreshed rows, so the table always shows the
 * database's truth rather than an optimistic guess that could drift.
 */

export function VocabScreen({
  kind,
  singular,
  plural,
  hint,
  counts,
  initial,
}: {
  kind: VocabKind;
  singular: string;
  plural: string;
  hint: string;
  counts: TaxonomyCounts;
  initial: VocabRow[];
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState(initial);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ id: number; value: string } | null>(null);
  const [confirm, setConfirm] = useState<VocabRow | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  function handle(result: VocabResult, okMessage?: string) {
    if (result.ok) {
      setRows(result.rows);
      if (okMessage) toast("success", okMessage);
    } else {
      toast("error", result.error);
    }
  }

  function add() {
    const name = draft.trim();
    if (!name) return;
    setDraft("");
    startTransition(async () => handle(await addVocab(kind, name), `Added ${name}.`));
  }

  function saveRename() {
    if (!editing) return;
    const { id, value } = editing;
    setEditing(null);
    startTransition(async () => handle(await renameVocabAction(kind, id, value)));
  }

  function toggleVisible(row: VocabRow) {
    startTransition(async () => handle(await setVocabVisibilityAction(kind, row.id, !row.isVisible)));
  }

  function confirmDelete() {
    if (!confirm) return;
    const id = confirm.id;
    setBusyDelete(true);
    startTransition(async () => {
      const result = await deleteVocabAction(kind, id);
      setBusyDelete(false);
      setConfirm(null);
      handle(result, "Deleted.");
    });
  }

  function onDrop(targetId: number) {
    if (dragId === null || dragId === targetId) return;
    const from = rows.findIndex((r) => r.id === dragId);
    const to = rows.findIndex((r) => r.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...rows];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setRows(next);
    setDragId(null);
    startTransition(async () => handle(await reorderVocabAction(kind, next.map((r) => r.id))));
  }

  return (
    <div className="mx-auto max-w-[900px]">
      <h2 className="mb-4 font-display text-2xl font-medium text-heading">Taxonomy</h2>
      <TaxonomyTabs counts={{ ...counts, [kind === "material" ? "materials" : "purities"]: rows.length }} />

      <p className="mb-3 rounded-[var(--sz-admin-radius-control)] border border-line-soft bg-admin-canvas px-3 py-2 text-[12.5px] text-muted">
        {hint}
      </p>

      <div className="overflow-hidden rounded-[var(--sz-admin-radius-card)] border border-line bg-raised">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line-soft text-left text-xs text-muted">
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Products</th>
              <th className="px-4 py-2.5 font-medium">Visible</th>
              <th className="w-24 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-[13px] text-muted">
                  No {plural.toLowerCase()} yet — add one below.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  draggable={editing?.id !== row.id}
                  onDragStart={() => setDragId(row.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(row.id)}
                  onDragEnd={() => setDragId(null)}
                  className={cn("border-b border-line-soft last:border-0", dragId === row.id && "opacity-50")}
                >
                  <td className="px-4 py-2.5">
                    {editing?.id === row.id ? (
                      <input
                        autoFocus
                        value={editing.value}
                        onChange={(e) => setEditing({ id: row.id, value: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveRename();
                          if (e.key === "Escape") setEditing(null);
                        }}
                        onBlur={saveRename}
                        className="min-h-8 w-full max-w-[280px] rounded-[7px] border border-primary-700 bg-admin-canvas px-2 text-[13px] text-body outline-none"
                      />
                    ) : (
                      <span className="flex items-center gap-2.5">
                        <span
                          aria-hidden="true"
                          className="size-2.5 shrink-0 rounded-full bg-accent"
                          style={{ opacity: row.isVisible ? 1 : 0.4 }}
                        />
                        <span className="font-medium text-heading">{row.name}</span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-muted">{row.productCount.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-2.5">
                    <Switch checked={row.isVisible} onChange={() => toggleVisible(row)} label={`Toggle ${row.name} visibility`} />
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="flex items-center justify-end gap-0.5">
                      <span className="cursor-grab px-1 text-muted" title="Drag to reorder" aria-hidden="true">
                        <Icon name="sort" size={15} />
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditing({ id: row.id, value: row.name })}
                        aria-label={`Rename ${row.name}`}
                        className="inline-flex size-8 items-center justify-center rounded-[7px] text-muted hover:bg-admin-canvas hover:text-body"
                      >
                        <Icon name="wrench" size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirm(row)}
                        aria-label={`Delete ${row.name}`}
                        className="inline-flex size-8 items-center justify-center rounded-[7px] text-muted hover:bg-error-soft hover:text-error"
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="flex items-center gap-2 border-t border-line-soft px-4 py-3">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
            aria-label={`Add a ${singular.toLowerCase()}`}
            placeholder={`Add a ${singular.toLowerCase()}…`}
            className="min-h-10 flex-1 rounded-[var(--sz-admin-radius-control)] border border-line bg-admin-canvas px-3 text-[13px] text-body outline-none placeholder:text-muted focus-visible:border-primary-700"
          />
          <button
            type="button"
            onClick={add}
            className="inline-flex min-h-10 items-center rounded-[var(--sz-admin-radius-control)] bg-primary-700 px-4 text-[13px] font-semibold text-white hover:bg-primary-800"
          >
            Add
          </button>
        </div>
      </div>

      <p className="mt-2 font-mono text-[11px] text-muted">Row order is the storefront filter order · drag a row to reorder.</p>

      <ConfirmDialog
        open={confirm !== null}
        title={`Delete ${singular.toLowerCase()}?`}
        tone="danger"
        confirmLabel="Delete"
        busy={busyDelete}
        onCancel={() => setConfirm(null)}
        onConfirm={confirmDelete}
        body={
          confirm && (
            <>
              <strong className="text-body">{confirm.name}</strong> will leave the managed list. Products keep
              the value — they simply won&rsquo;t offer it as a filter option.
            </>
          )
        }
      />
    </div>
  );
}
