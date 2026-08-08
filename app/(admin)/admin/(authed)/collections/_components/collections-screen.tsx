"use client";

import { useState, useTransition } from "react";
import { Icon, useToast } from "@/components/ui";
import { Switch } from "@/components/admin/switch";
import { MultiSelect } from "@/components/admin/multi-select";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { cn } from "@/lib/cn";
import type { CollectionInput, CollectionRow, TaxonomyCounts } from "@/lib/admin/taxonomy";
import type { ProductEditorOptions } from "@/lib/admin/catalog";
import { TaxonomyTabs } from "@/components/admin/taxonomy/taxonomy-tabs";
import {
  loadCollection,
  saveCollectionAction,
  deleteCollectionAction,
  setCollectionVisibilityAction,
  reorderCollectionsAction,
  type CollectionResult,
} from "../_actions";

/**
 * Collections — Sazuna Admin Taxonomy.dc.html. A reorderable list of
 * rule-populated collections: the drawer sets the auto-populate rules (any of
 * these categories OR any of these tags, within an optional sale-price band).
 * The product count on each row is the live number those rules match.
 *
 * (The spec's hand-picked manual products and the 1:1 image are a deliberate
 * follow-up — the rule-based collection is the substantive core and is already
 * ahead of the reference's category/tag-only model.)
 */

const BLANK: CollectionInput = {
  name: "", slug: "", description: "", isVisible: true, categoryIds: [], tagIds: [], priceBandMin: "", priceBandMax: "",
};

export function CollectionsScreen({
  initial,
  counts,
  options,
}: {
  initial: CollectionRow[];
  counts: TaxonomyCounts;
  options: ProductEditorOptions;
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState(initial);
  const [editing, setEditing] = useState<{ id: number | null; input: CollectionInput } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [confirm, setConfirm] = useState<CollectionRow | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  function handle(result: CollectionResult, ok?: string) {
    if (result.ok) {
      setRows(result.rows);
      if (ok) toast("success", ok);
    } else {
      toast("error", result.error);
    }
  }

  function openEdit(row: CollectionRow) {
    setLoadingDetail(true);
    setEditing({ id: row.id, input: { ...BLANK, name: row.name, slug: row.slug } });
    startTransition(async () => {
      const detail = await loadCollection(row.id);
      setLoadingDetail(false);
      if (detail) {
        setEditing({
          id: detail.id,
          input: {
            name: detail.name, slug: detail.slug, description: detail.description, isVisible: detail.isVisible,
            categoryIds: detail.categoryIds, tagIds: detail.tagIds, priceBandMin: detail.priceBandMin, priceBandMax: detail.priceBandMax,
          },
        });
      }
    });
  }

  function save() {
    if (!editing) return;
    if (!editing.input.name.trim()) {
      toast("error", "A name is required.");
      return;
    }
    const { id, input } = editing;
    startTransition(async () => {
      const result = await saveCollectionAction(id, input);
      if (result.ok) setEditing(null);
      handle(result, id ? "Collection updated." : "Collection created.");
    });
  }

  function toggleVisible(row: CollectionRow) {
    startTransition(async () => handle(await setCollectionVisibilityAction(row.id, !row.isVisible)));
  }

  function confirmDelete() {
    if (!confirm) return;
    const id = confirm.id;
    setBusyDelete(true);
    startTransition(async () => {
      const result = await deleteCollectionAction(id);
      setBusyDelete(false);
      setConfirm(null);
      handle(result, "Collection deleted.");
    });
  }

  function onDrop(target: CollectionRow) {
    if (dragId === null || dragId === target.id) return;
    const from = rows.findIndex((r) => r.id === dragId);
    const to = rows.findIndex((r) => r.id === target.id);
    setDragId(null);
    if (from < 0 || to < 0) return;
    const next = [...rows];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setRows(next);
    startTransition(async () => handle(await reorderCollectionsAction(next.map((r) => r.id))));
  }

  const setInput = (patch: Partial<CollectionInput>) => editing && setEditing({ ...editing, input: { ...editing.input, ...patch } });

  return (
    <div className="mx-auto max-w-[900px]">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-2xl font-medium text-heading">Taxonomy</h2>
        <button type="button" onClick={() => setEditing({ id: null, input: { ...BLANK } })} className="inline-flex min-h-10 items-center gap-2 rounded-[var(--sz-admin-radius-control)] bg-primary-700 px-4 text-[13px] font-semibold text-white hover:bg-primary-800">
          <Icon name="plus" size={16} strokeWidth={2} /> Add collection
        </button>
      </div>
      <TaxonomyTabs counts={{ ...counts, collections: rows.length }} />

      <div className="overflow-hidden rounded-[var(--sz-admin-radius-card)] border border-line bg-raised">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line-soft text-left text-xs text-muted">
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Slug</th>
              <th className="px-4 py-2.5 font-medium">Products</th>
              <th className="px-4 py-2.5 font-medium">Visible</th>
              <th className="w-20 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-[13px] text-muted">No collections yet — add one.</td></tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  draggable
                  onDragStart={() => setDragId(row.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(row)}
                  onDragEnd={() => setDragId(null)}
                  className={cn("border-b border-line-soft last:border-0", dragId === row.id && "opacity-50")}
                >
                  <td className="px-4 py-2.5 font-medium text-heading">{row.name}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-muted">{row.slug}</td>
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-body">{row.productCount.toLocaleString("en-IN")}</span>
                    <span className="ml-1.5 text-[11px] text-muted">
                      ({row.categoryCount} cat · {row.tagCount} tag{(row.priceBandMin || row.priceBandMax) ? " · band" : ""})
                    </span>
                  </td>
                  <td className="px-4 py-2.5"><Switch checked={row.isVisible} onChange={() => toggleVisible(row)} label={`Toggle ${row.name}`} /></td>
                  <td className="px-4 py-2.5">
                    <span className="flex items-center justify-end gap-0.5">
                      <span className="cursor-grab px-1 text-muted" title="Drag to reorder" aria-hidden="true"><Icon name="sort" size={15} /></span>
                      <button type="button" onClick={() => openEdit(row)} aria-label={`Edit ${row.name}`} className="inline-flex size-8 items-center justify-center rounded-[7px] text-muted hover:bg-admin-canvas hover:text-body"><Icon name="wrench" size={15} /></button>
                      <button type="button" onClick={() => setConfirm(row)} aria-label={`Delete ${row.name}`} className="inline-flex size-8 items-center justify-center rounded-[7px] text-muted hover:bg-error-soft hover:text-error"><Icon name="trash" size={15} /></button>
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 font-mono text-[11px] text-muted">Row order is the storefront order · drag a row to reorder.</p>

      {editing && (
        <>
          <button type="button" aria-label="Close" onClick={() => setEditing(null)} className="fixed inset-0 z-40 bg-[var(--sz-overlay)]" />
          <aside className="fixed inset-y-0 right-0 z-50 flex w-[min(452px,100vw)] flex-col bg-raised shadow-[var(--sz-shadow-drawer)]">
            <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
              <h3 className="font-display text-md font-medium text-heading">{editing.id ? "Edit collection" : "New collection"}</h3>
              <button type="button" onClick={() => setEditing(null)} aria-label="Close" className="inline-flex size-8 items-center justify-center rounded-[7px] text-muted hover:bg-admin-canvas"><Icon name="close" size={18} /></button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {loadingDetail && <p className="text-[12.5px] text-muted">Loading rules…</p>}
              <Labeled label="Name *">
                <input value={editing.input.name} onChange={(e) => setInput({ name: e.target.value })} placeholder="e.g. Bridal Edit" className={fieldClass} />
              </Labeled>
              <Labeled label="Slug" hint="Leave blank to generate from the name.">
                <input value={editing.input.slug} onChange={(e) => setInput({ slug: e.target.value })} placeholder="bridal-edit" className={cn(fieldClass, "font-mono")} />
              </Labeled>
              <Labeled label="Description">
                <textarea value={editing.input.description} onChange={(e) => setInput({ description: e.target.value })} rows={3} className={cn(fieldClass, "resize-y py-2")} />
              </Labeled>

              <div className="rounded-[10px] border border-line-soft p-3">
                <p className="mb-2 text-xs font-semibold text-body">Auto-populate rules</p>
                <p className="mb-2.5 text-[11px] text-muted">A product joins if it is in any chosen category OR carries any chosen tag, within the price band.</p>
                <div className="space-y-3">
                  <div>
                    <p className="mb-1 text-[11px] font-semibold text-muted">Categories</p>
                    <MultiSelect ariaLabel="Categories" placeholder="Any category" options={options.categories.map((c) => ({ value: String(c.id), label: c.name }))} selected={editing.input.categoryIds.map(String)} onChange={(v) => setInput({ categoryIds: v.map(Number) })} />
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] font-semibold text-muted">Tags</p>
                    <MultiSelect ariaLabel="Tags" placeholder="Any tag" options={options.tags.map((t) => ({ value: String(t.id), label: t.name }))} selected={editing.input.tagIds.map(String)} onChange={(v) => setInput({ tagIds: v.map(Number) })} />
                  </div>
                  <div className="flex gap-2.5">
                    <div className="flex-1">
                      <p className="mb-1 text-[11px] font-semibold text-muted">Min sale price</p>
                      <input value={editing.input.priceBandMin} onChange={(e) => setInput({ priceBandMin: e.target.value })} inputMode="decimal" placeholder="—" className={cn(fieldClass, "font-mono")} />
                    </div>
                    <div className="flex-1">
                      <p className="mb-1 text-[11px] font-semibold text-muted">Max sale price</p>
                      <input value={editing.input.priceBandMax} onChange={(e) => setInput({ priceBandMax: e.target.value })} inputMode="decimal" placeholder="—" className={cn(fieldClass, "font-mono")} />
                    </div>
                  </div>
                </div>
              </div>

              <label className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-body">Visible on the storefront</span>
                <Switch checked={editing.input.isVisible} onChange={(v) => setInput({ isVisible: v })} label="Visible" />
              </label>
            </div>
            <div className="flex gap-2.5 border-t border-line px-4 py-3.5">
              <button type="button" onClick={() => setEditing(null)} className="min-h-11 flex-1 rounded-[var(--sz-admin-radius-control)] border border-line text-[13px] font-semibold text-body hover:border-primary-700">Cancel</button>
              <button type="button" onClick={save} className="min-h-11 flex-1 rounded-[var(--sz-admin-radius-control)] bg-primary-700 text-[13px] font-semibold text-white hover:bg-primary-800">Save</button>
            </div>
          </aside>
        </>
      )}

      <ConfirmDialog
        open={confirm !== null}
        title="Delete collection?"
        tone="danger"
        confirmLabel="Delete"
        busy={busyDelete}
        onCancel={() => setConfirm(null)}
        onConfirm={confirmDelete}
        body={confirm && (<><strong className="text-body">{confirm.name}</strong> will be removed. Products are untouched — a collection is only a saved grouping.</>)}
      />
    </div>
  );
}

const fieldClass =
  "min-h-10 w-full rounded-[var(--sz-admin-radius-control)] border border-line bg-admin-canvas px-2.5 text-[13px] text-body outline-none placeholder:text-muted focus-visible:border-primary-700";

function Labeled({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-body">{label}</p>
      {children}
      {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}
