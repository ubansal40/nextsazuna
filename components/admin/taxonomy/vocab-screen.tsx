"use client";

import { useState, useTransition } from "react";
import { Icon, useToast } from "@/components/ui";
import { Switch } from "@/components/admin/switch";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import {
  StackedBody,
  StackedCell,
  StackedHead,
  StackedRow,
  StackedTable,
  StackedTh,
} from "@/components/admin/stacked-table";
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
 * visibility switch, move up/down, rename and delete), with an inline add at the
 * foot. Both vocabularies share this one screen, differing only by `kind`.
 *
 * Every mutation returns the refreshed rows and the table re-renders from those,
 * so it always settles on the database's truth rather than on a guess.
 *
 * **Reordering is by button, not only by drag.** HTML5 `draggable` does not fire
 * on a touch device at all, and this admin is used on a phone — so the row's
 * up/down controls are the real interface and the drag is a desktop shortcut
 * layered on top. A reorder is applied locally first so the row moves under the
 * finger, then rolled straight back if the write is refused: the row order IS
 * the storefront filter order, so a list left ahead of the database is a lie
 * until someone happens to refresh.
 */

/** Move one entry from `from` to `to`. Both the buttons and the drop go through
 *  this, so the two paths cannot drift into different operations. */
function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

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

  /** Apply the new order locally, persist it, and restore the previous order
   *  exactly if the server refuses — otherwise a refused reorder leaves the
   *  screen showing a sequence the database never accepted. */
  function reorder(next: VocabRow[]) {
    const before = rows;
    setRows(next);
    startTransition(async () => {
      const result = await reorderVocabAction(kind, next.map((r) => r.id));
      if (result.ok) {
        setRows(result.rows);
      } else {
        setRows(before);
        toast("error", result.error);
      }
    });
  }

  function move(index: number, delta: number) {
    const to = index + delta;
    if (to < 0 || to >= rows.length) return;
    reorder(moveItem(rows, index, to));
  }

  function onDrop(targetId: number) {
    if (dragId === null || dragId === targetId) return;
    const from = rows.findIndex((r) => r.id === dragId);
    const to = rows.findIndex((r) => r.id === targetId);
    setDragId(null);
    if (from < 0 || to < 0) return;
    reorder(moveItem(rows, from, to));
  }

  return (
    <div className="mx-auto max-w-[900px]">
      <h2 className="mb-4 font-display text-2xl font-medium text-heading">Taxonomy</h2>
      <TaxonomyTabs counts={{ ...counts, [kind === "material" ? "materials" : "purities"]: rows.length }} />

      <p className="mb-3 rounded-[var(--sz-admin-radius-control)] border border-line-soft bg-admin-canvas px-3 py-2 text-[12.5px] text-muted">
        {hint}
      </p>

      {rows.length === 0 ? (
        /* Beside the table rather than in a spanning cell — once the rows become
         * cards there are no columns left to span. */
        <div className="rounded-[var(--sz-admin-radius-card)] border border-line bg-raised px-4 py-10 text-center text-[13px] text-muted">
          No {plural.toLowerCase()} yet — add one below.
        </div>
      ) : (
        <StackedTable label={plural} tableClassName="min-[761px]:min-w-[560px]">
          <StackedHead>
            <StackedTh>Name</StackedTh>
            <StackedTh>Products</StackedTh>
            <StackedTh>Visible</StackedTh>
            <StackedTh className="w-[172px]" />
          </StackedHead>
          <StackedBody>
            {rows.map((row, index) => (
              <StackedRow
                key={row.id}
                draggable={editing?.id !== row.id}
                onDragStart={() => setDragId(row.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(row.id)}
                onDragEnd={() => setDragId(null)}
                className={cn(dragId === row.id && "opacity-50")}
              >
                <StackedCell label="Name">
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
                </StackedCell>
                <StackedCell label="Products" className="font-mono text-muted">
                  {row.productCount.toLocaleString("en-IN")}
                </StackedCell>
                <StackedCell label="Visible">
                  <Switch checked={row.isVisible} onChange={() => toggleVisible(row)} label={`Toggle ${row.name} visibility`} />
                </StackedCell>
                <StackedCell label="">
                  <span className="flex items-center justify-end gap-0.5">
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label={`Move ${row.name} up`}
                      title="Move up"
                      className={rowAction}
                    >
                      <Icon name="chevron-up" size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === rows.length - 1}
                      aria-label={`Move ${row.name} down`}
                      title="Move down"
                      className={rowAction}
                    >
                      <Icon name="chevron-down" size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing({ id: row.id, value: row.name })}
                      aria-label={`Rename ${row.name}`}
                      title="Rename"
                      className={rowAction}
                    >
                      <Icon name="wrench" size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirm(row)}
                      aria-label={`Delete ${row.name}`}
                      title="Delete"
                      className={cn(rowAction, "hover:bg-error-soft hover:text-error")}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </span>
                </StackedCell>
              </StackedRow>
            ))}
          </StackedBody>
        </StackedTable>
      )}

      {/* The add row is a sibling of the table rather than a final cell inside
          it: below 761px the table has no card to sit in, and a form control in
          a spanning row is exactly the markup that stops collapsing cleanly. */}
      <div className="mt-2.5 flex items-center gap-2 rounded-[var(--sz-admin-radius-card)] border border-line bg-raised px-4 py-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          aria-label={`Add a ${singular.toLowerCase()}`}
          placeholder={`Add a ${singular.toLowerCase()}…`}
          className="min-h-10 min-w-0 flex-1 rounded-[var(--sz-admin-radius-control)] border border-line bg-admin-canvas px-3 text-[13px] text-body outline-none placeholder:text-muted focus-visible:border-primary-700"
        />
        <button
          type="button"
          onClick={add}
          className="inline-flex min-h-10 shrink-0 items-center rounded-[var(--sz-admin-radius-control)] bg-primary-700 px-4 text-[13px] font-semibold text-white hover:bg-primary-800"
        >
          Add
        </button>
      </div>

      <p className="mt-2 font-mono text-[11px] text-muted">
        Row order is the storefront filter order · use a row&rsquo;s up/down arrows to reorder it, or drag it.
      </p>

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

/** 32px on desktop, 44px below 760 — the spec's own touch-target bump, and the
 *  reason four controls still fit on a phone once the row becomes a card. */
const rowAction =
  "inline-flex size-8 max-[760px]:size-11 shrink-0 items-center justify-center rounded-[7px] text-muted hover:bg-admin-canvas hover:text-body disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted";
