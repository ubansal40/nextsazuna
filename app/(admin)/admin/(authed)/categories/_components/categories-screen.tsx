"use client";

import { useMemo, useState, useTransition } from "react";
import { Icon, useDialog, useToast } from "@/components/ui";
import { Switch } from "@/components/admin/switch";
import { ImageField } from "@/components/admin/image-field";
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
import type { CategoryInput, CategoryRow, TaxonomyCounts } from "@/lib/admin/taxonomy";
import { TaxonomyTabs } from "@/components/admin/taxonomy/taxonomy-tabs";
import {
  saveCategoryAction,
  deleteCategoryAction,
  setCategoryVisibilityAction,
  reorderCategoriesAction,
  type CategoryResult,
} from "../_actions";

/**
 * Categories — the two-level tree from Sazuna Admin Taxonomy.dc.html. Parents
 * expand to their children; each row carries a live product count, a visibility
 * switch, move up/down, and edit/delete. The entity drawer is the add/edit form.
 * Reordering is within a sibling group, since row order is the storefront order.
 * Uncategorized is protected: it can't be deleted, and stays top-level.
 *
 * **Reordering is by button, not only by drag.** HTML5 `draggable` never fires
 * on a touch device, and this admin is used on a phone — so the up/down controls
 * are the real interface and the drag is a desktop shortcut on top of them. Both
 * move within the sibling group, because that is the only order the storefront
 * reads.
 */

/** Move one entry from `from` to `to`. The buttons and the drop share it, so a
 *  keyboard move and a drag of the same distance cannot disagree. */
function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

const BLANK: CategoryInput = { name: "", slug: "", parentId: null, description: "", imageUrl: null, isVisible: true };

export function CategoriesScreen({ initial, counts }: { initial: CategoryRow[]; counts: TaxonomyCounts }) {
  const { toast } = useToast();
  const [rows, setRows] = useState(initial);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<{ id: number | null; input: CategoryInput } | null>(null);
  const [confirm, setConfirm] = useState<CategoryRow | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  // The pending flag is kept, not discarded: it is what disables Save for the
  // length of the round trip, and two taps inside that window used to create two
  // identical categories.
  const [busy, startTransition] = useTransition();

  const { ref: drawerRef, onBackdropClick } = useDialog(editing !== null, () => setEditing(null));

  const topLevel = useMemo(() => rows.filter((r) => r.parentId == null), [rows]);
  const childrenOf = (id: number) => rows.filter((r) => r.parentId === id);
  const parentOptions = topLevel;

  function handle(result: CategoryResult, ok?: string) {
    if (result.ok) {
      setRows(result.rows);
      if (ok) toast("success", ok);
    } else {
      toast("error", result.error);
    }
  }

  function save() {
    if (!editing || busy) return;
    const { id, input } = editing;
    if (!input.name.trim()) {
      toast("error", "A name is required.");
      return;
    }
    startTransition(async () => {
      const result = await saveCategoryAction(id, input);
      if (result.ok) setEditing(null);
      handle(result, id ? "Category updated." : "Category created.");
    });
  }

  function toggleVisible(row: CategoryRow) {
    startTransition(async () => handle(await setCategoryVisibilityAction(row.id, !row.isVisible)));
  }

  function confirmDelete() {
    if (!confirm) return;
    const id = confirm.id;
    setBusyDelete(true);
    startTransition(async () => {
      const result = await deleteCategoryAction(id);
      setBusyDelete(false);
      setConfirm(null);
      handle(result, "Category deleted — its products moved to Uncategorized.");
    });
  }

  function onDrop(target: CategoryRow) {
    if (dragId === null) return;
    const dragged = rows.find((r) => r.id === dragId);
    setDragId(null);
    if (!dragged || dragged.id === target.id || dragged.parentId !== target.parentId) return;
    const siblings = rows.filter((r) => r.parentId === target.parentId);
    const from = siblings.findIndex((r) => r.id === dragged.id);
    const to = siblings.findIndex((r) => r.id === target.id);
    if (from < 0 || to < 0) return;
    reorder(moveItem(siblings, from, to));
  }

  /** One step up or down within the row's own sibling group — the touch and
   *  keyboard path to the same write the drag performs. */
  function move(row: CategoryRow, delta: number) {
    const siblings = rows.filter((r) => r.parentId === row.parentId);
    const from = siblings.findIndex((r) => r.id === row.id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= siblings.length) return;
    reorder(moveItem(siblings, from, to));
  }

  /** The action returns the whole refreshed tree, so nothing is applied
   *  optimistically here — the list can never be left ahead of the database. */
  function reorder(siblings: CategoryRow[]) {
    startTransition(async () => handle(await reorderCategoriesAction(siblings.map((r) => r.id))));
  }

  return (
    <div className="mx-auto max-w-[900px]">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-2xl font-medium text-heading">Taxonomy</h2>
        <button
          type="button"
          onClick={() => setEditing({ id: null, input: { ...BLANK } })}
          className="inline-flex min-h-10 items-center gap-2 rounded-[var(--sz-admin-radius-control)] bg-primary-700 px-4 text-[13px] font-semibold text-white hover:bg-primary-800"
        >
          <Icon name="plus" size={16} strokeWidth={2} /> Add category
        </button>
      </div>
      <TaxonomyTabs counts={{ ...counts, categories: rows.length }} />

      <StackedTable label="Categories" tableClassName="min-[761px]:min-w-[720px]">
        <StackedHead>
          <StackedTh>Name</StackedTh>
          <StackedTh>Slug</StackedTh>
          <StackedTh>Products</StackedTh>
          <StackedTh>Visible</StackedTh>
          <StackedTh className="w-[172px]" />
        </StackedHead>
        <StackedBody>
          {topLevel.map((parent, parentIndex) => {
            const kids = childrenOf(parent.id);
            const open = expanded.has(parent.id);
            return (
              <FragmentRows key={parent.id}>
                <CategoryTr
                  row={parent}
                  depth={0}
                  hasKids={kids.length > 0}
                  open={open}
                  onToggleOpen={() =>
                    setExpanded((s) => {
                      const n = new Set(s);
                      if (n.has(parent.id)) n.delete(parent.id);
                      else n.add(parent.id);
                      return n;
                    })
                  }
                  onEdit={() => setEditing({ id: parent.id, input: toInput(parent) })}
                  onDelete={() => setConfirm(parent)}
                  onVisible={() => toggleVisible(parent)}
                  onMove={(delta) => move(parent, delta)}
                  canUp={parentIndex > 0}
                  canDown={parentIndex < topLevel.length - 1}
                  dragId={dragId}
                  setDragId={setDragId}
                  onDrop={() => onDrop(parent)}
                />
                {open &&
                  kids.map((kid, kidIndex) => (
                    <CategoryTr
                      key={kid.id}
                      row={kid}
                      depth={1}
                      hasKids={false}
                      open={false}
                      onEdit={() => setEditing({ id: kid.id, input: toInput(kid) })}
                      onDelete={() => setConfirm(kid)}
                      onVisible={() => toggleVisible(kid)}
                      onMove={(delta) => move(kid, delta)}
                      canUp={kidIndex > 0}
                      canDown={kidIndex < kids.length - 1}
                      dragId={dragId}
                      setDragId={setDragId}
                      onDrop={() => onDrop(kid)}
                    />
                  ))}
              </FragmentRows>
            );
          })}
        </StackedBody>
      </StackedTable>
      <p className="mt-2 font-mono text-[11px] text-muted">
        Row order is the storefront order · use a row&rsquo;s up/down arrows to move it within its parent, or drag it.
      </p>

      {/* Entity drawer — a native modal <dialog>, so Escape, the focus trap, the
          backdrop and focus restore on close all come from the platform. It
          stays mounted and is driven by `open`, because a dialog unmounted while
          open never gets to hand focus back to whatever opened it. */}
      <dialog
        ref={drawerRef}
        onClick={onBackdropClick}
        aria-label={editing?.id ? "Edit category" : "New category"}
        className={drawerClass}
      >
        {editing && (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
              <h3 className="font-display text-md font-medium text-heading">{editing.id ? "Edit category" : "New category"}</h3>
              <button type="button" onClick={() => setEditing(null)} aria-label="Close" className="inline-flex size-10 items-center justify-center rounded-[7px] text-muted hover:bg-admin-canvas">
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              <Labeled label="Name *">
                <input value={editing.input.name} onChange={(e) => setEditing({ ...editing, input: { ...editing.input, name: e.target.value } })} placeholder="e.g. Diamond Rings" className={fieldClass} />
              </Labeled>
              <Labeled label="Slug" hint="Leave blank to generate from the name.">
                <input value={editing.input.slug} onChange={(e) => setEditing({ ...editing, input: { ...editing.input, slug: e.target.value } })} placeholder="diamond-rings" className={cn(fieldClass, "font-mono")} />
              </Labeled>
              <Labeled label="Parent category">
                <select
                  value={editing.input.parentId ?? ""}
                  onChange={(e) => setEditing({ ...editing, input: { ...editing.input, parentId: e.target.value ? Number(e.target.value) : null } })}
                  className={fieldClass}
                >
                  <option value="">No parent (top level)</option>
                  {parentOptions
                    .filter((p) => p.id !== editing.id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                </select>
              </Labeled>
              <Labeled label="Description" hint="Shown on the storefront listing page.">
                <textarea value={editing.input.description} onChange={(e) => setEditing({ ...editing, input: { ...editing.input, description: e.target.value } })} rows={4} className={cn(fieldClass, "resize-y py-2")} />
              </Labeled>
              <ImageField
                kind="categories"
                slug={editing.input.slug || editing.input.name || "category"}
                value={editing.input.imageUrl}
                onChange={(imageUrl) => setEditing({ ...editing, input: { ...editing.input, imageUrl } })}
                hint="Shown on the storefront category card. Anything not square is centre-cropped."
              />
              <label className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-body">Visible on the storefront</span>
                <Switch checked={editing.input.isVisible} onChange={(v) => setEditing({ ...editing, input: { ...editing.input, isVisible: v } })} label="Visible" />
              </label>
            </div>
            <div className="flex gap-2.5 border-t border-line px-4 py-3.5">
              <button type="button" onClick={() => setEditing(null)} disabled={busy} className="min-h-11 flex-1 rounded-[var(--sz-admin-radius-control)] border border-line text-[13px] font-semibold text-body hover:border-primary-700 disabled:opacity-[var(--sz-disabled-opacity)]">Cancel</button>
              <button type="button" onClick={save} disabled={busy} aria-busy={busy || undefined} className="min-h-11 flex-1 rounded-[var(--sz-admin-radius-control)] bg-primary-700 text-[13px] font-semibold text-white hover:bg-primary-800 disabled:cursor-progress disabled:opacity-[var(--sz-disabled-opacity)]">Save</button>
            </div>
          </div>
        )}
      </dialog>

      <ConfirmDialog
        open={confirm !== null}
        title="Delete category?"
        tone="danger"
        confirmLabel="Delete"
        busy={busyDelete}
        onCancel={() => setConfirm(null)}
        onConfirm={confirmDelete}
        body={confirm && (<><strong className="text-body">{confirm.name}</strong> will be removed. Its {confirm.productCount} product(s) move to Uncategorized; any sub-categories become top-level.</>)}
      />
    </div>
  );
}

const fieldClass =
  "min-h-10 w-full rounded-[var(--sz-admin-radius-control)] border border-line bg-admin-canvas px-2.5 text-[13px] text-body outline-none placeholder:text-muted focus-visible:border-primary-700";

/**
 * The 452px right-hand drawer on a native <dialog>.
 *
 * The UA centres a modal dialog and caps it at `calc(100% - 12px)` in both axes,
 * so the margins pin it to the trailing edge and the size pair overrides that
 * cap. Everything else — the focus trap, Escape, the backdrop, inertness of the
 * page behind — is what `showModal()` gives for free.
 */
const drawerClass =
  "m-0 ml-auto h-dvh max-h-none w-[min(452px,100vw)] max-w-none border-l border-line bg-raised p-0 text-body shadow-[var(--sz-shadow-drawer)] backdrop:bg-[var(--sz-overlay)]";

/** 32px on desktop, 44px below 760 — the spec's own touch-target bump, and what
 *  lets four controls share a row once it collapses into a card. */
const rowAction =
  "inline-flex size-8 max-[760px]:size-11 shrink-0 items-center justify-center rounded-[7px] text-muted hover:bg-admin-canvas hover:text-body disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted";

function toInput(row: CategoryRow): CategoryInput {
  return { name: row.name, slug: row.slug, parentId: row.parentId, description: row.description, imageUrl: row.imageUrl, isVisible: row.isVisible };
}

function FragmentRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function Labeled({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-body">{label}</p>
      {children}
      {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

function CategoryTr({
  row,
  depth,
  hasKids,
  open,
  onToggleOpen,
  onEdit,
  onDelete,
  onVisible,
  onMove,
  canUp,
  canDown,
  dragId,
  setDragId,
  onDrop,
}: {
  row: CategoryRow;
  depth: number;
  hasKids: boolean;
  open: boolean;
  onToggleOpen?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onVisible: () => void;
  onMove: (delta: number) => void;
  /** Whether the row has a sibling above / below it to trade places with. */
  canUp: boolean;
  canDown: boolean;
  dragId: number | null;
  setDragId: (id: number | null) => void;
  onDrop: () => void;
}) {
  return (
    <StackedRow
      draggable
      onDragStart={() => setDragId(row.id)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onDragEnd={() => setDragId(null)}
      className={cn(dragId === row.id && "opacity-50")}
    >
      <StackedCell label="Name">
        <span className="flex items-center gap-1.5" style={{ paddingLeft: depth * 22 }}>
          {hasKids ? (
            <button type="button" onClick={onToggleOpen} aria-expanded={open} aria-label={open ? "Collapse" : "Expand"} className="inline-flex size-6 items-center justify-center rounded text-muted hover:bg-admin-canvas">
              <Icon name="chevron-down" size={14} className={cn("transition-transform", !open && "-rotate-90")} />
            </button>
          ) : (
            <span className="inline-block w-6" aria-hidden="true" />
          )}
          <span className="font-medium text-heading">{row.name}</span>
          {hasKids && <span className="rounded-pill bg-surface px-1.5 font-mono text-[10px] text-muted">{row.childCount}</span>}
        </span>
      </StackedCell>
      <StackedCell label="Slug" className="whitespace-nowrap font-mono text-muted">{row.slug}</StackedCell>
      <StackedCell label="Products" className="font-mono text-body">{row.productCount.toLocaleString("en-IN")}</StackedCell>
      <StackedCell label="Visible">
        <Switch checked={row.isVisible} onChange={onVisible} label={`Toggle ${row.name} visibility`} />
      </StackedCell>
      <StackedCell label="">
        <span className="flex items-center justify-end gap-0.5">
          <button type="button" onClick={() => onMove(-1)} disabled={!canUp} aria-label={`Move ${row.name} up`} title="Move up" className={rowAction}>
            <Icon name="chevron-up" size={15} />
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={!canDown} aria-label={`Move ${row.name} down`} title="Move down" className={rowAction}>
            <Icon name="chevron-down" size={15} />
          </button>
          <button type="button" onClick={onEdit} aria-label={`Edit ${row.name}`} title="Edit" className={rowAction}>
            <Icon name="wrench" size={15} />
          </button>
          {!row.isProtected && (
            <button type="button" onClick={onDelete} aria-label={`Delete ${row.name}`} title="Delete" className={cn(rowAction, "hover:bg-error-soft hover:text-error")}>
              <Icon name="trash" size={15} />
            </button>
          )}
        </span>
      </StackedCell>
    </StackedRow>
  );
}
