"use client";

import { useState, useTransition } from "react";
import { Icon, useDialog, useToast } from "@/components/ui";
import { Switch } from "@/components/admin/switch";
import { MultiSelect } from "@/components/admin/multi-select";
import { ImageField } from "@/components/admin/image-field";
import { ProductThumb } from "@/components/admin/product-thumb";
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
 *
 * **The drawer only exists once the record has arrived.** The list row carries a
 * name, a slug and an image; the rules, the picks and the description come from
 * a second fetch. A save posts the *whole* input, so a form rendered from that
 * partial row and submitted early would write an empty description, no
 * categories, no tags, no price band and zero picks straight over the stored
 * collection. So the drawer shows a loading state until the fetch lands, says so
 * plainly if it fails, and offers no Save in either case.
 *
 * **Reordering is by button, not only by drag.** HTML5 `draggable` never fires
 * on touch, and this admin is used on a phone. The order is applied locally and
 * rolled straight back if the write is refused, so the list never keeps a
 * storefront order the database does not have.
 */

const BLANK: CollectionInput = {
  name: "", slug: "", description: "", imageUrl: null, isVisible: true,
  categoryIds: [], tagIds: [], priceBandMin: "", priceBandMax: "", manualProductIds: [],
};

/**
 * Where the drawer's record is up to. A new collection starts "ready" because
 * there is nothing to fetch; an existing one cannot be saved until its stored
 * rules and picks are in hand.
 */
type DetailPhase = "loading" | "ready" | "failed";

type Editing = { id: number | null; input: CollectionInput; picks: CollectionPick[]; phase: DetailPhase };

/** Move one entry from `from` to `to`. The buttons and the drop share it, so a
 *  keyboard move and a drag of the same distance cannot disagree. */
function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

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
  const [editing, setEditing] = useState<Editing | null>(null);
  const [confirm, setConfirm] = useState<CollectionRow | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  // The pending flag is kept, not discarded: it disables Save for the length of
  // the round trip, and two taps inside that window used to create two identical
  // collections.
  const [busy, startTransition] = useTransition();

  const { ref: drawerRef, onBackdropClick } = useDialog(editing !== null, () => setEditing(null));

  function handle(result: CollectionResult, ok?: string) {
    if (result.ok) {
      setRows(result.rows);
      if (ok) toast("success", ok);
    } else {
      toast("error", result.error);
    }
  }

  function openEdit(row: CollectionRow) {
    // Seeded from the row only so the drawer's heading is not blank while the
    // record loads — this input is never saved, because `phase` is "loading".
    setEditing({ id: row.id, input: { ...BLANK, name: row.name, slug: row.slug, imageUrl: row.imageUrl }, picks: [], phase: "loading" });
    loadDetail(row.id);
  }

  function loadDetail(id: number) {
    setEditing((current) => (current && current.id === id ? { ...current, phase: "loading" } : current));
    startTransition(async () => {
      const detail = await loadCollection(id);
      setEditing((current) => {
        // The drawer may have been closed, or reopened on another collection,
        // while this was in flight — a late reply must not seed a form the admin
        // is now looking at for a different row.
        if (!current || current.id !== id) return current;
        if (!detail) return { ...current, phase: "failed" };
        return {
          id: detail.id,
          input: {
            name: detail.name, slug: detail.slug, description: detail.description, imageUrl: detail.imageUrl, isVisible: detail.isVisible,
            categoryIds: detail.categoryIds, tagIds: detail.tagIds, priceBandMin: detail.priceBandMin, priceBandMax: detail.priceBandMax,
            manualProductIds: detail.manualProducts.map((p) => p.id),
          },
          picks: detail.manualProducts,
          phase: "ready",
        };
      });
    });
  }

  function save() {
    // `phase` is the guard that matters: a save posts every field, so saving a
    // drawer whose record has not arrived would write BLANK over the stored
    // rules, picks and description.
    if (!editing || editing.phase !== "ready" || busy) return;
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

  /** Apply the new order locally, persist it, and put the previous order back
   *  exactly if the server refuses — the row order IS the storefront order, so a
   *  list left ahead of the database lies until someone happens to refresh. */
  function reorder(next: CollectionRow[]) {
    const before = rows;
    setRows(next);
    startTransition(async () => {
      const result = await reorderCollectionsAction(next.map((r) => r.id));
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

  function onDrop(target: CollectionRow) {
    if (dragId === null || dragId === target.id) return;
    const from = rows.findIndex((r) => r.id === dragId);
    const to = rows.findIndex((r) => r.id === target.id);
    setDragId(null);
    if (from < 0 || to < 0) return;
    reorder(moveItem(rows, from, to));
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
        <button type="button" onClick={() => setEditing({ id: null, input: { ...BLANK }, picks: [], phase: "ready" })} className="inline-flex min-h-10 items-center gap-2 rounded-[var(--sz-admin-radius-control)] bg-primary-700 px-4 text-[13px] font-semibold text-white hover:bg-primary-800">
          <Icon name="plus" size={16} strokeWidth={2} /> Add collection
        </button>
      </div>
      <TaxonomyTabs counts={{ ...counts, collections: rows.length }} />

      {rows.length === 0 ? (
        /* Beside the table rather than in a spanning cell — once the rows become
         * cards there are no columns left to span. */
        <div className="rounded-[var(--sz-admin-radius-card)] border border-line bg-raised px-4 py-10 text-center text-[13px] text-muted">
          No collections yet — add one.
        </div>
      ) : (
        <StackedTable label="Collections" tableClassName="min-[761px]:min-w-[720px]">
          <StackedHead>
            <StackedTh>Name</StackedTh>
            <StackedTh>Slug</StackedTh>
            <StackedTh>Products</StackedTh>
            <StackedTh>Visible</StackedTh>
            <StackedTh className="w-[172px]" />
          </StackedHead>
          <StackedBody>
            {rows.map((row, index) => (
              <StackedRow
                key={row.id}
                draggable
                onDragStart={() => setDragId(row.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(row)}
                onDragEnd={() => setDragId(null)}
                className={cn(dragId === row.id && "opacity-50")}
              >
                <StackedCell label="Name" className="font-medium text-heading">{row.name}</StackedCell>
                <StackedCell label="Slug" className="font-mono text-muted">{row.slug}</StackedCell>
                {/* The breakdown sits under the count rather than beside it: inline
                    it lengthened the cell enough to push the table past 375px. */}
                <StackedCell label="Products">
                  <span className="flex flex-col items-end min-[761px]:items-start">
                    <span className="font-mono text-body">{row.productCount.toLocaleString("en-IN")}</span>
                    <span className="text-[11px] text-muted">
                      {row.categoryCount} cat · {row.tagCount} tag
                      {(row.priceBandMin || row.priceBandMax) ? " · band" : ""}
                      {row.manualCount > 0 ? ` · ${row.manualCount} picked` : ""}
                    </span>
                  </span>
                </StackedCell>
                <StackedCell label="Visible">
                  <Switch checked={row.isVisible} onChange={() => toggleVisible(row)} label={`Toggle ${row.name}`} />
                </StackedCell>
                <StackedCell label="">
                  <span className="flex items-center justify-end gap-0.5">
                    <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move ${row.name} up`} title="Move up" className={rowAction}><Icon name="chevron-up" size={15} /></button>
                    <button type="button" onClick={() => move(index, 1)} disabled={index === rows.length - 1} aria-label={`Move ${row.name} down`} title="Move down" className={rowAction}><Icon name="chevron-down" size={15} /></button>
                    <button type="button" onClick={() => openEdit(row)} aria-label={`Edit ${row.name}`} title="Edit" className={rowAction}><Icon name="wrench" size={15} /></button>
                    <button type="button" onClick={() => setConfirm(row)} aria-label={`Delete ${row.name}`} title="Delete" className={cn(rowAction, "hover:bg-error-soft hover:text-error")}><Icon name="trash" size={15} /></button>
                  </span>
                </StackedCell>
              </StackedRow>
            ))}
          </StackedBody>
        </StackedTable>
      )}
      <p className="mt-2 font-mono text-[11px] text-muted">
        Row order is the storefront order · use a row&rsquo;s up/down arrows to reorder it, or drag it.
      </p>

      {/* A native modal <dialog>: Escape, the focus trap, the backdrop and focus
          restore on close all come from the platform. It stays mounted and is
          driven by `open`, because a dialog unmounted while open never gets to
          hand focus back to the row that opened it. */}
      <dialog
        ref={drawerRef}
        onClick={onBackdropClick}
        aria-label={editing?.id ? "Edit collection" : "New collection"}
        className={drawerClass}
      >
        {editing && (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
              <h3 className="font-display text-md font-medium text-heading">{editing.id ? "Edit collection" : "New collection"}</h3>
              <button type="button" onClick={() => setEditing(null)} aria-label="Close" className="inline-flex size-10 items-center justify-center rounded-[7px] text-muted hover:bg-admin-canvas"><Icon name="close" size={18} /></button>
            </div>

            {editing.phase === "loading" ? (
              /* No form at all until the record lands. A form seeded from the
                 list row is missing the description, the rules and every pick,
                 and a save posts all of them. */
              <div className="flex-1 px-4 py-6">
                <p role="status" className="text-[12.5px] text-muted">Loading this collection&rsquo;s rules and picks…</p>
              </div>
            ) : editing.phase === "failed" ? (
              <div className="flex-1 px-4 py-6">
                <div role="alert" className="rounded-xl border border-error-border bg-error-soft px-3.5 py-3">
                  <p className="text-[13px] font-semibold text-heading">This collection couldn&rsquo;t be loaded</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">
                    Nothing has been changed. It may have been deleted by someone else — close and refresh the list to
                    see where it stands.
                  </p>
                </div>
                <div className="mt-3 flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => editing.id != null && loadDetail(editing.id)}
                    disabled={busy}
                    className="min-h-11 flex-1 rounded-[var(--sz-admin-radius-control)] bg-primary-700 text-[13px] font-semibold text-white hover:bg-primary-800 disabled:opacity-[var(--sz-disabled-opacity)]"
                  >
                    Try again
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    className="min-h-11 flex-1 rounded-[var(--sz-admin-radius-control)] border border-line text-[13px] font-semibold text-body hover:border-primary-700"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <>
              <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
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
                {/* Keyed on the collection, so the search box inside cannot carry a
                    half-typed term from the collection edited before this one. */}
                <ManualPicks
                  key={editing.id ?? "new"}
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
                <button type="button" onClick={() => setEditing(null)} disabled={busy} className="min-h-11 flex-1 rounded-[var(--sz-admin-radius-control)] border border-line text-[13px] font-semibold text-body hover:border-primary-700 disabled:opacity-[var(--sz-disabled-opacity)]">Cancel</button>
                <button type="button" onClick={save} disabled={busy} aria-busy={busy || undefined} className="min-h-11 flex-1 rounded-[var(--sz-admin-radius-control)] bg-primary-700 text-[13px] font-semibold text-white hover:bg-primary-800 disabled:cursor-progress disabled:opacity-[var(--sz-disabled-opacity)]">Save</button>
              </div>
              </>
            )}
          </div>
        )}
      </dialog>

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

/**
 * The 452px right-hand drawer on a native <dialog>.
 *
 * The UA centres a modal dialog and caps it at `calc(100% - 12px)` in both axes,
 * so the margins pin it to the trailing edge and the size pair overrides that
 * cap. Everything else — the focus trap, Escape, the backdrop, inertness of the
 * list behind — is what `showModal()` gives for free.
 */
const drawerClass =
  "m-0 ml-auto h-dvh max-h-none w-[min(452px,100vw)] max-w-none border-l border-line bg-raised p-0 text-body shadow-[var(--sz-shadow-drawer)] backdrop:bg-[var(--sz-overlay)]";

/** 32px on desktop, 44px below 760 — the spec's own touch-target bump, and what
 *  lets four controls share a row once it collapses into a card. */
const rowAction =
  "inline-flex size-8 max-[760px]:size-11 shrink-0 items-center justify-center rounded-[7px] text-muted hover:bg-admin-canvas hover:text-body disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted";

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
