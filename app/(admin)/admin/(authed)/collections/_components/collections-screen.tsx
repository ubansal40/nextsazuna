"use client";

import { useState, useTransition } from "react";
import { Icon, useToast } from "@/components/ui";
import { Switch } from "@/components/admin/switch";
import { MultiSelect } from "@/components/admin/multi-select";
import { ImageField } from "@/components/admin/image-field";
import { ProductThumb } from "@/components/admin/product-thumb";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { cn } from "@/lib/cn";
import type { CollectionInput, CollectionPick, CollectionRow, TaxonomyCounts } from "@/lib/admin/taxonomy";
import type { ProductEditorOptions } from "@/lib/admin/catalog";
import { TaxonomyTabs } from "@/components/admin/taxonomy/taxonomy-tabs";
import {
  loadCollection,
  saveCollectionAction,
  deleteCollectionAction,
  setCollectionVisibilityAction,
  reorderCollectionsAction,
  searchProductsForPicksAction,
  type CollectionResult,
} from "../_actions";

/**
 * Collections — Sazuna Admin Taxonomy.dc.html. A reorderable list of
 * rule-populated collections. The drawer holds the spec's two membership
 * sections: the auto-populate rules (any of these categories OR any of these
 * tags, within an optional sale-price band), and the hand-picked products in
 * the order they should appear. The count on each row is the live union of the
 * two, counted DISTINCT — a product that is both matched and picked is one.
 */

const BLANK: CollectionInput = {
  name: "", slug: "", description: "", imageUrl: null, isVisible: true,
  categoryIds: [], tagIds: [], priceBandMin: "", priceBandMax: "", manualProductIds: [],
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
  // `picks` mirrors `input.manualProductIds` with the name/SKU/thumb the rows
  // need — the input carries ids alone, so the display data rides alongside and
  // the id list is derived from it at save.
  const [editing, setEditing] = useState<{ id: number | null; input: CollectionInput; picks: CollectionPick[] } | null>(null);
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
    setEditing({ id: row.id, input: { ...BLANK, name: row.name, slug: row.slug, imageUrl: row.imageUrl }, picks: [] });
    startTransition(async () => {
      const detail = await loadCollection(row.id);
      setLoadingDetail(false);
      if (detail) {
        setEditing({
          id: detail.id,
          input: {
            name: detail.name, slug: detail.slug, description: detail.description, imageUrl: detail.imageUrl, isVisible: detail.isVisible,
            categoryIds: detail.categoryIds, tagIds: detail.tagIds, priceBandMin: detail.priceBandMin, priceBandMax: detail.priceBandMax,
            manualProductIds: detail.manualProducts.map((p) => p.id),
          },
          picks: detail.manualProducts,
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
    const { id, input, picks } = editing;
    startTransition(async () => {
      const result = await saveCollectionAction(id, { ...input, manualProductIds: picks.map((p) => p.id) });
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
  const setPicks = (picks: CollectionPick[]) => editing && setEditing({ ...editing, picks });

  /** Move a pick one place up or down — the spec's per-row arrows. Order is the
   *  storefront order, so this is the whole point of the section. */
  function movePick(index: number, delta: number) {
    if (!editing) return;
    const next = [...editing.picks];
    const to = index + delta;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    setPicks(next);
  }

  return (
    <div className="mx-auto max-w-[900px]">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-2xl font-medium text-heading">Taxonomy</h2>
        <button type="button" onClick={() => setEditing({ id: null, input: { ...BLANK }, picks: [] })} className="inline-flex min-h-10 items-center gap-2 rounded-[var(--sz-admin-radius-control)] bg-primary-700 px-4 text-[13px] font-semibold text-white hover:bg-primary-800">
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
                  <td className="px-4 py-2.5 font-mono text-muted">{row.slug}</td>
                  {/* The breakdown sits on its own line: inline it lengthened the
                      cell enough to push the table past a 375px viewport. */}
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-body">{row.productCount.toLocaleString("en-IN")}</span>
                    <span className="block text-[11px] text-muted">
                      {row.categoryCount} cat · {row.tagCount} tag
                      {(row.priceBandMin || row.priceBandMax) ? " · band" : ""}
                      {row.manualCount > 0 ? ` · ${row.manualCount} picked` : ""}
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
              <ImageField
                kind="collections"
                slug={editing.input.slug || editing.input.name || "collection"}
                value={editing.input.imageUrl}
                onChange={(imageUrl) => setInput({ imageUrl })}
                hint="Shown on the storefront collection card. Anything not square is centre-cropped."
              />

              <p className={sectionLabel}>1 · Auto-populate rules</p>
              <div className="rounded-[10px] border border-line-soft p-3">
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

              <p className={sectionLabel}>2 · Manually added products</p>
              <ManualPicks
                picks={editing.picks}
                onMove={movePick}
                onRemove={(id) => setPicks(editing.picks.filter((p) => p.id !== id))}
                onAdd={(pick) => setPicks([...editing.picks, pick])}
              />

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

/** The spec's `.adx-lbl2` step eyebrow above each membership section. */
const sectionLabel = "mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-accent-strong";

/**
 * The spec's "Manually added products" block: the hand-picked list in its
 * stored order, each row movable and removable, plus a name/SKU search to add
 * more. A compact search rather than the full product picker — the drawer is
 * 452px wide and the task here is "find this one piece", not "browse".
 *
 * Picks are additive to the rules, so a product already matched by a rule is
 * simply redundant rather than wrong; the count on the list de-duplicates.
 */
function ManualPicks({
  picks,
  onMove,
  onRemove,
  onAdd,
}: {
  picks: CollectionPick[];
  onMove: (index: number, delta: number) => void;
  onRemove: (id: number) => void;
  onAdd: (pick: CollectionPick) => void;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<CollectionPick[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [, startTransition] = useTransition();

  function search(value: string) {
    setTerm(value);
    if (value.trim().length < 2) {
      setResults(null);
      return;
    }
    setSearching(true);
    startTransition(async () => {
      const found = await searchProductsForPicksAction(value);
      setSearching(false);
      setResults(found);
    });
  }

  const chosen = new Set(picks.map((p) => p.id));

  return (
    <div className="space-y-2.5">
      <p className="text-[11px] text-muted">Hand-picked pieces in the order they should appear. Anything a rule already matches is simply listed once.</p>

      {picks.length === 0 ? (
        <p className="rounded-[11px] border-[1.5px] border-dashed border-line bg-canvas px-3.5 py-4 text-center text-xs text-muted">No hand-picked products yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {picks.map((pick, index) => (
            <li key={pick.id} className="flex items-center gap-2 rounded-[9px] border border-line-soft bg-canvas py-1.5 pl-2 pr-1.5">
              <span className="w-4 shrink-0 font-mono text-[10px] font-semibold text-muted">{index + 1}</span>
              <ProductThumb src={pick.imageUrl} alt="" size={34} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium text-heading">{pick.name}</span>
                <span className="block font-mono text-[10.5px] text-muted">{pick.sku}</span>
              </span>
              <button type="button" onClick={() => onMove(index, -1)} disabled={index === 0} aria-label={`Move ${pick.name} up`} title="Move up" className={pickActionClass}>
                <Icon name="chevron-up" size={15} />
              </button>
              <button type="button" onClick={() => onMove(index, 1)} disabled={index === picks.length - 1} aria-label={`Move ${pick.name} down`} title="Move down" className={pickActionClass}>
                <Icon name="chevron-down" size={15} />
              </button>
              <button type="button" onClick={() => onRemove(pick.id)} aria-label={`Remove ${pick.name}`} title="Remove" className={cn(pickActionClass, "text-error hover:bg-error-soft")}>
                <Icon name="close" size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div>
        <input
          value={term}
          onChange={(e) => search(e.target.value)}
          placeholder="Add products — search by name or SKU"
          aria-label="Search products to add"
          className={fieldClass}
        />
        {term.trim().length >= 2 && (
          <div className="mt-1.5 max-h-[220px] overflow-y-auto rounded-[9px] border border-line bg-raised p-1">
            {searching && results === null ? (
              <p className="px-2 py-2 text-[11px] text-muted">Searching…</p>
            ) : results && results.length > 0 ? (
              results.map((product) => {
                const already = chosen.has(product.id);
                return (
                  <button
                    key={product.id}
                    type="button"
                    disabled={already}
                    onClick={() => {
                      onAdd(product);
                      setTerm("");
                      setResults(null);
                    }}
                    className="flex w-full items-center gap-2 rounded-[7px] px-1.5 py-1.5 text-left hover:bg-admin-canvas disabled:opacity-50 disabled:hover:bg-transparent"
                  >
                    <ProductThumb src={product.imageUrl} alt="" size={28} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-heading">{product.name}</span>
                      <span className="block font-mono text-[10.5px] text-muted">{product.sku}</span>
                    </span>
                    {already && <span className="shrink-0 text-[10.5px] font-semibold text-muted">Added</span>}
                  </button>
                );
              })
            ) : (
              <p className="px-2 py-2 text-[11px] text-muted">No products match “{term.trim()}”.</p>
            )}
          </div>
        )}
      </div>

      {picks.length > 0 && (
        <p role="status" className="rounded-[11px] border border-accent-soft bg-warning-soft px-3 py-2.5 text-[12.5px] font-semibold text-[var(--sz-admin-gold-ink)]">
          {picks.length} hand-picked {picks.length === 1 ? "product" : "products"} · saved with the collection
        </p>
      )}
    </div>
  );
}

/** 34px on desktop, 44px below 760 — the spec's own touch-target bump. */
const pickActionClass =
  "inline-flex size-[34px] max-[760px]:size-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface disabled:opacity-30 disabled:hover:bg-transparent";

function Labeled({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-body">{label}</p>
      {children}
      {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}
