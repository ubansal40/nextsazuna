"use client";

import { useRouter } from "next/navigation";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Icon, useToast } from "@/components/ui";
import { Chip, type ChipTone } from "@/components/admin/chip";
import { ProductThumb } from "@/components/admin/product-thumb";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import type { AdminProductListItem, ProductStatus } from "@/lib/admin/product-projection";
// Pure policy — `image-queue` carries no `server-only`, so the sentence the
// operator reads about a failure is built the same way here and on the server.
import { operatorFailureMessage } from "@/lib/admin/image-queue";
import type { AdminProductFilters, AdminProductFilterOptions, AdminProductPage } from "@/lib/admin/catalog";
import {
  fetchProductsPage,
  setVisibility,
  removeProduct,
  setAlwaysAvailable,
  removeProducts,
  pollImageJobs,
  retryProductImages,
} from "../_actions";

/**
 * All Products — Sazuna Admin Products.dc.html.
 *
 * A load-more list (not numbered pages): search and filters replace the list,
 * "Load more" appends. Mutations update the loaded rows in place so the view
 * does not jump. Availability is `is_active`, so "publish"/"unpublish" is the
 * whole of visibility — there is no stock to move.
 */

type DrawerFilters = Omit<AdminProductFilters, "q" | "page" | "pageSize">;

const STATUS_CHIP: Record<ProductStatus, { tone: ChipTone; label: string }> = {
  published: { tone: "success", label: "Published" },
  draft: { tone: "neutral", label: "Draft" },
  processing: { tone: "warning", label: "Processing" },
  failed: { tone: "error", label: "Failed" },
};

const SORT_LABELS: { value: string; label: string }[] = [
  { value: "id_desc", label: "Newest first" },
  { value: "id_asc", label: "Oldest first" },
  { value: "name_asc", label: "Name A–Z" },
  { value: "name_desc", label: "Name Z–A" },
  { value: "price_asc", label: "Price low–high" },
  { value: "price_desc", label: "Price high–low" },
  { value: "status_desc", label: "Published first" },
  { value: "status_asc", label: "Draft first" },
];

const EMPTY_DRAWER: DrawerFilters = { sort: "id_desc" };

export function ProductsView({
  initial,
  options,
}: {
  initial: AdminProductPage;
  options: AdminProductFilterOptions;
}) {
  const { toast } = useToast();
  const [items, setItems] = useState(initial.items);
  const [total, setTotal] = useState(initial.total);
  const [page, setPage] = useState(initial.page);
  const [q, setQ] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState<DrawerFilters>(EMPTY_DRAWER);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState<DrawerFilters>(EMPTY_DRAWER);
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<AdminProductListItem | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const menuRef = useRef<HTMLTableSectionElement>(null);

  const hasMore = items.length < total;

  /**
   * Keep the processing rows moving.
   *
   * The reference app's admin can be passive here: a daemon does the work and
   * the next page load shows the result. With no daemon the screen is a
   * trigger, not just a viewer — each poll drains the queue and then reads
   * back what changed, so a product whose photos are mid-encode reaches
   * Published while the operator watches instead of on some later refresh.
   *
   * It runs only while something is actually in flight, and stops the moment
   * nothing is, so an idle products list makes no requests at all.
   */
  const processingIds = items.filter((i) => i.status === "processing").map((i) => i.id);
  const processingKey = processingIds.join(",");

  useEffect(() => {
    if (!processingKey) return;
    const ids = processingKey.split(",").map(Number);
    let cancelled = false;

    async function tick() {
      let states;
      try {
        states = await pollImageJobs(ids);
      } catch {
        return; // A missed poll is a slower update, not an error worth showing.
      }
      if (cancelled || states.length === 0) return;
      const byProduct = new Map(states.map((s) => [s.productId, s]));
      setItems((current) =>
        current.map((item) => {
          const state = byProduct.get(item.id);
          if (!state || state.status === "pending" || state.status === "processing") return item;
          if (state.status === "failed") {
            return { ...item, status: "failed", imageError: operatorFailureMessage(state.error) };
          }
          if (state.status !== "ready") return item;
          // "Ready" is about the photos, not about visibility: a job restores
          // whatever the product was saved with, so an edited draft stays a
          // draft once its new photos land.
          return {
            ...item,
            status: state.productIsActive ? "published" : "draft",
            imageError: null,
            imageUrl: state.images[0] ?? item.imageUrl,
          };
        }),
      );
    }

    const timer = setInterval(tick, 4000);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [processingKey]);

  /** Re-queue a product whose photos failed, using the raw originals on disk. */
  function retryPhotos(id: number) {
    setOpenMenu(null);
    startTransition(async () => {
      const result = await retryProductImages(id);
      if (!result.ok) {
        toast("error", result.error);
        return;
      }
      setItems((current) =>
        current.map((i) => (i.id === id ? { ...i, status: "processing", imageError: null } : i)),
      );
      toast("info", "Processing those photos again.");
    });
  }

  // Close the open row-menu on any outside pointer-down.
  useEffect(() => {
    if (openMenu === null) return;
    function onDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpenMenu(null);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [openMenu]);

  function load(nextFilters: DrawerFilters, nextQ: string, nextPage: number, append: boolean) {
    startTransition(async () => {
      const result = await fetchProductsPage({ ...nextFilters, q: nextQ, page: nextPage });
      setItems((current) => (append ? [...current, ...result.items] : result.items));
      setTotal(result.total);
      setPage(result.page);
      if (!append) setSelected(new Set());
    });
  }

  function apply(nextFilters: DrawerFilters, nextQ: string) {
    setFilters(nextFilters);
    setQ(nextQ);
    load(nextFilters, nextQ, 1, false);
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    apply(filters, searchInput.trim());
  }

  function clearFilter(key: keyof DrawerFilters | "q") {
    if (key === "q") {
      setSearchInput("");
      apply(filters, "");
      return;
    }
    const next = { ...filters };
    delete next[key];
    apply(next, q);
  }

  // --- selection ---
  const allLoadedSelected = items.length > 0 && items.every((i) => selected.has(i.id));
  function toggleRow(id: number) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAllLoaded() {
    setSelected(allLoadedSelected ? new Set() : new Set(items.map((i) => i.id)));
  }

  // --- mutations ---
  /** Bulk-set the stock-sync exemption. The list carries no always_available
   *  column, so the page is refetched rather than patched — showing a state the
   *  row cannot display would be worse than a round trip. */
  function alwaysAvailable(ids: number[], value: boolean) {
    setOpenMenu(null);
    startTransition(async () => {
      const result = await setAlwaysAvailable(ids, value);
      if (!result.ok) {
        toast("error", result.error);
        return;
      }
      toast("success", `${result.changed} product${result.changed === 1 ? "" : "s"} updated.`);
      setSelected(new Set());
      apply(filters, q);
    });
  }

  /** Bulk delete. Products with order history come back as "unpublished
   *  instead", and the toast says so — silently keeping them would look like
   *  the delete failed. */
  function bulkDelete(ids: number[]) {
    setConfirmBulkDelete(false);
    startTransition(async () => {
      const result = await removeProducts(ids);
      if (!result.ok) {
        toast("error", result.error);
        return;
      }
      toast(
        "success",
        result.softDeleted > 0
          ? `${result.hardDeleted} deleted · ${result.softDeleted} unpublished instead (they appear in past orders).`
          : `${result.hardDeleted} product${result.hardDeleted === 1 ? "" : "s"} deleted.`,
      );
      setSelected(new Set());
      apply(filters, q);
    });
  }

  function publish(ids: number[], isActive: boolean) {
    setOpenMenu(null);
    startTransition(async () => {
      const result = await setVisibility(ids, isActive);
      if (!result.ok) {
        toast("error", "Couldn't update those products.");
        return;
      }
      const idSet = new Set(ids);
      setItems((current) =>
        current.map((i) => (idSet.has(i.id) ? { ...i, status: isActive ? "published" : "draft" } : i)),
      );
      setSelected(new Set());
      toast("success", `${result.changed} ${result.changed === 1 ? "product" : "products"} ${isActive ? "published" : "unpublished"}.`);
    });
  }

  function confirmDelete() {
    if (!confirm) return;
    const target = confirm;
    setBusyDelete(true);
    startTransition(async () => {
      const result = await removeProduct(target.id);
      setBusyDelete(false);
      setConfirm(null);
      if (!result.ok) {
        toast("error", "Couldn't delete that product.");
        return;
      }
      if (result.mode === "hard") {
        setItems((current) => current.filter((i) => i.id !== target.id));
        setTotal((t) => Math.max(0, t - 1));
        toast("success", "Product deleted.");
      } else {
        setItems((current) => current.map((i) => (i.id === target.id ? { ...i, status: "draft" } : i)));
        toast("info", "This product has order history — it was unpublished instead of deleted.");
      }
    });
  }

  const activeChips = buildChips(filters, q, options);
  const activeFilterCount = activeChips.length;

  return (
    <div className="mx-auto max-w-[1100px]">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-medium text-heading">All Products</h2>
          <p className="mt-0.5 font-mono text-[11.5px] text-muted">{total.toLocaleString("en-IN")} products</p>
        </div>
        <Link
          href="/admin/products/new"
          className="inline-flex min-h-11 items-center gap-2 rounded-[var(--sz-admin-radius-control)] bg-primary-700 px-4 text-[13px] font-semibold text-white no-underline hover:bg-primary-800 hover:no-underline"
        >
          <Icon name="plus" size={16} strokeWidth={2} />
          Add products
        </Link>
      </div>

      <div className="overflow-hidden rounded-[var(--sz-admin-radius-card)] border border-line bg-raised">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2.5 border-b border-line-soft px-3.5 py-3">
          <form onSubmit={submitSearch} className="relative min-w-[160px] flex-1">
            <Icon name="search" size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Search products by name or SKU"
              placeholder="Search name or SKU"
              className="min-h-10 w-full rounded-[var(--sz-admin-radius-control)] border border-line bg-admin-canvas pl-8 pr-3 text-[13px] text-body outline-none placeholder:text-muted focus-visible:border-primary-700 focus-visible:shadow-[var(--sz-ring-focus-soft)]"
            />
          </form>
          <button
            type="button"
            onClick={() => {
              setDraft(filters);
              setDrawerOpen(true);
            }}
            className="inline-flex min-h-10 items-center gap-2 rounded-[var(--sz-admin-radius-control)] border border-line bg-raised px-3.5 text-[12.5px] font-semibold text-body hover:border-accent"
          >
            <Icon name="filter" size={15} />
            Filters
            {activeFilterCount > 0 && (
              <span className="inline-flex size-5 items-center justify-center rounded-pill bg-primary-700 text-[10px] font-semibold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Active filter chips */}
        {activeChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-3.5 py-2.5">
            {activeChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => clearFilter(chip.key)}
                className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-admin-canvas px-2.5 py-1 text-[11.5px] text-body hover:border-primary-700"
              >
                {chip.label}
                <Icon name="close" size={12} />
              </button>
            ))}
            <button
              type="button"
              onClick={() => apply(EMPTY_DRAWER, "")}
              className="px-1 text-[11.5px] font-semibold text-primary-700 hover:underline"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line-soft text-left text-xs text-muted">
                <th className="w-9 px-3.5 py-2.5">
                  <input
                    type="checkbox"
                    checked={allLoadedSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = selected.size > 0 && !allLoadedSelected;
                    }}
                    onChange={toggleAllLoaded}
                    aria-label="Select all loaded products"
                    className="size-4 accent-[var(--sz-primary-700)]"
                  />
                </th>
                <th className="px-3.5 py-2.5 font-medium">Product</th>
                <th className="px-3.5 py-2.5 font-medium">SKU</th>
                <th className="px-3.5 py-2.5 font-medium">Category</th>
                <th className="px-3.5 py-2.5 font-medium">Purity</th>
                <th className="px-3.5 py-2.5 text-right font-medium">Sale Price</th>
                <th className="px-3.5 py-2.5 font-medium">Status</th>
                <th className="w-10 px-3.5 py-2.5" />
              </tr>
            </thead>
            <tbody ref={menuRef}>
              {items.length === 0 && !pending ? (
                <tr>
                  <td colSpan={8} className="px-4 py-14 text-center">
                    <p className="text-sm font-semibold text-heading">No products match</p>
                    <p className="mt-1 text-[13px] text-muted">Try a different search or clear the filters.</p>
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const chip = STATUS_CHIP[item.status];
                  const isSelected = selected.has(item.id);
                  return (
                    <tr key={item.id} className={cn("border-b border-line-soft last:border-0", isSelected && "bg-primary-50/40")}>
                      <td className="px-3.5 py-2.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRow(item.id)}
                          aria-label={`Select ${item.name}`}
                          className="size-4 accent-[var(--sz-primary-700)]"
                        />
                      </td>
                      <td className="px-3.5 py-2.5">
                        <span className="flex items-center gap-2.5">
                          <ProductThumb src={item.imageUrl} alt={item.name} size={30} />
                          <span className="font-medium text-heading">{item.name}</span>
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 font-mono text-muted">{item.sku}</td>
                      <td className="px-3.5 py-2.5 text-body">{item.categoryNames || "—"}</td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 font-mono text-body">{item.purity || "—"}</td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-right font-mono">
                        {item.hasSale ? (
                          <>
                            <span className="font-semibold text-primary-700">{formatPrice(item.salePrice)}</span>{" "}
                            <span className="text-price-struck line-through">{formatPrice(item.price)}</span>
                          </>
                        ) : (
                          <span className="text-body">{formatPrice(item.price)}</span>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <Chip tone={chip.tone}>{chip.label}</Chip>
                        {/* The reason, not just the verdict. "Failed" alone
                            leaves the operator guessing whether to retry or to
                            re-shoot the photo. */}
                        {item.status === "failed" && item.imageError && (
                          <p className="mt-1 max-w-[26ch] text-[11px] leading-snug text-muted">
                            {item.imageError}
                          </p>
                        )}
                      </td>
                      <td className="relative px-3.5 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => setOpenMenu(openMenu === item.id ? null : item.id)}
                          aria-label={`Actions for ${item.name}`}
                          className="inline-flex size-8 items-center justify-center rounded-[7px] text-muted hover:bg-admin-canvas"
                        >
                          <KebabIcon />
                        </button>
                        {openMenu === item.id && (
                          <div className="absolute right-3.5 top-11 z-20 w-44 rounded-[10px] border border-line bg-raised p-1.5 text-left shadow-[var(--sz-shadow-dropdown)]">
                            <Link
                              href={`/admin/products/${item.id}/edit`}
                              className="flex min-h-9 items-center rounded-lg px-2.5 text-[13px] text-body no-underline hover:bg-admin-canvas hover:no-underline"
                            >
                              Edit
                            </Link>
                            {item.status === "failed" && (
                              <button
                                type="button"
                                onClick={() => retryPhotos(item.id)}
                                className="flex min-h-9 w-full items-center rounded-lg px-2.5 text-left text-[13px] font-semibold text-primary-700 hover:bg-admin-canvas"
                              >
                                Retry photos
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => publish([item.id], item.status !== "published")}
                              className="flex min-h-9 w-full items-center rounded-lg px-2.5 text-left text-[13px] text-body hover:bg-admin-canvas"
                            >
                              {item.status === "published" ? "Unpublish" : "Publish"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenu(null);
                                setConfirm(item);
                              }}
                              className="flex min-h-9 w-full items-center rounded-lg px-2.5 text-left text-[13px] text-error hover:bg-error-soft"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer: load more */}
        <div className="flex items-center justify-between gap-3 border-t border-line-soft px-3.5 py-3">
          <span className="font-mono text-[11.5px] text-muted">
            Showing {items.length.toLocaleString("en-IN")} of {total.toLocaleString("en-IN")}
          </span>
          {hasMore && (
            <button
              type="button"
              onClick={() => load(filters, q, page + 1, true)}
              disabled={pending}
              className="inline-flex min-h-10 items-center rounded-[var(--sz-admin-radius-control)] border border-line bg-raised px-4 text-[12.5px] font-semibold text-primary-700 hover:border-primary-700 disabled:opacity-[var(--sz-disabled-opacity)]"
            >
              {pending ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      </div>

      {/* Bulk bar — `pBulkOpen` in the spec: a dark pill floating over the list,
          not a panel. "Bulk edit" is its lead action and carries the sand fill;
          everything destructive stays in the danger red. */}
      {selected.size > 0 && (
        <div className="fixed bottom-4 left-1/2 z-40 max-w-[calc(100vw-24px)] -translate-x-1/2 rounded-xl bg-body px-4 py-2.5 text-white shadow-[0_18px_44px_-14px_rgb(var(--sz-heading-rgb)/.55)]">
          <div className="flex flex-wrap items-center gap-3">
            <span className="whitespace-nowrap text-[12.5px] font-semibold">{selected.size} selected</span>
            <div className="flex flex-wrap gap-[7px]">
              <button
                type="button"
                onClick={() => router.push(`/admin/products/bulk?ids=${[...selected].join(",")}`)}
                className="min-h-10 rounded-[7px] bg-ann-text px-3 py-2 text-[12px] font-semibold text-body hover:bg-white"
              >
                Bulk edit
              </button>
              <button
                type="button"
                onClick={() => publish([...selected], true)}
                className="min-h-10 rounded-[7px] bg-white/10 px-3 py-2 text-[12px] font-semibold text-white hover:bg-white/20"
              >
                Publish
              </button>
              <button
                type="button"
                onClick={() => publish([...selected], false)}
                className="min-h-10 rounded-[7px] bg-white/10 px-3 py-2 text-[12px] font-semibold text-white hover:bg-white/20"
              >
                Unpublish
              </button>
              <button
                type="button"
                onClick={() => alwaysAvailable([...selected], true)}
                title="Exempt these from the stock sync drafting them"
                className="min-h-10 rounded-[7px] bg-white/10 px-3 py-2 text-[12px] font-semibold text-white hover:bg-white/20"
              >
                Always available on
              </button>
              <button
                type="button"
                onClick={() => alwaysAvailable([...selected], false)}
                className="min-h-10 rounded-[7px] bg-white/10 px-3 py-2 text-[12px] font-semibold text-white hover:bg-white/20"
              >
                Always available off
              </button>
              <button
                type="button"
                onClick={() => setConfirmBulkDelete(true)}
                className="min-h-10 rounded-[7px] bg-error px-3 py-2 text-[12px] font-semibold text-white hover:bg-danger-hover"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                aria-label="Clear selection"
                className="inline-flex size-10 items-center justify-center rounded-[7px] text-white/65 hover:text-white"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      <FilterDrawer
        open={drawerOpen}
        draft={draft}
        setDraft={setDraft}
        options={options}
        onClose={() => setDrawerOpen(false)}
        onApply={() => {
          setDrawerOpen(false);
          apply(draft, q);
        }}
        onClear={() => setDraft(EMPTY_DRAWER)}
      />

      <ConfirmDialog
        open={confirmBulkDelete}
        title={`Delete ${selected.size} product${selected.size === 1 ? "" : "s"}?`}
        tone="danger"
        confirmLabel="Delete"
        onCancel={() => setConfirmBulkDelete(false)}
        onConfirm={() => bulkDelete([...selected])}
        body={
          <>
            Any of these that appear in a past order are <strong className="text-body">unpublished instead of
            deleted</strong> — removing one would tear a line item out of a customer&rsquo;s receipt. The rest are
            removed for good.
          </>
        }
      />

      <ConfirmDialog
        open={confirm !== null}
        title="Delete product?"
        tone="danger"
        confirmLabel="Delete"
        busy={busyDelete}
        onCancel={() => setConfirm(null)}
        onConfirm={confirmDelete}
        body={
          confirm && (
            <>
              <strong className="text-body">{confirm.name}</strong> will be removed. A product with order
              history is unpublished instead, so past orders still name it.
            </>
          )
        }
      />
    </div>
  );
}

/* --- filter drawer --------------------------------------------------------- */

function FilterDrawer({
  open,
  draft,
  setDraft,
  options,
  onClose,
  onApply,
  onClear,
}: {
  open: boolean;
  draft: DrawerFilters;
  setDraft: (f: DrawerFilters) => void;
  options: AdminProductFilterOptions;
  onClose: () => void;
  onApply: () => void;
  onClear: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const set = (patch: Partial<DrawerFilters>) => setDraft({ ...draft, ...patch });

  return (
    <>
      <button type="button" aria-label="Close filters" onClick={onClose} className="fixed inset-0 z-40 bg-[var(--sz-overlay)]" />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-[min(360px,100vw)] flex-col bg-raised shadow-[var(--sz-shadow-drawer)]">
        <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
          <h3 className="font-display text-md font-medium text-heading">Filters</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="inline-flex size-8 items-center justify-center rounded-[7px] text-muted hover:bg-admin-canvas">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <Field label="Sort by">
            <Select value={draft.sort ?? "id_desc"} onChange={(v) => set({ sort: v })} options={SORT_LABELS} />
          </Field>
          <Field label="Status">
            <Select
              value={draft.status ?? ""}
              onChange={(v) => set({ status: (v || undefined) as DrawerFilters["status"] })}
              options={[
                { value: "", label: "All" },
                { value: "published", label: "Published" },
                { value: "draft", label: "Draft" },
              ]}
            />
          </Field>
          <Field label="Category">
            <Select
              value={draft.category ?? ""}
              onChange={(v) => set({ category: v || undefined })}
              options={[{ value: "", label: "All categories" }, ...options.categories]}
            />
          </Field>
          <Field label="Material">
            <Select
              value={draft.material ?? ""}
              onChange={(v) => set({ material: v || undefined })}
              options={[{ value: "", label: "All materials" }, ...options.materials]}
            />
          </Field>
          <Field label="Purity">
            <Select
              value={draft.purity ?? ""}
              onChange={(v) => set({ purity: v || undefined })}
              options={[{ value: "", label: "All purities" }, ...options.purities]}
            />
          </Field>
          <Field label="Tag">
            <Select
              value={draft.tag ? String(draft.tag) : ""}
              onChange={(v) => set({ tag: v ? Number(v) : undefined })}
              options={[{ value: "", label: "All tags" }, ...options.tags.map((t) => ({ value: String(t.value), label: t.label }))]}
            />
          </Field>
          <Field label="Availability">
            <Select
              value={draft.alwaysAvailable === true ? "1" : draft.alwaysAvailable === false ? "0" : ""}
              onChange={(v) => set({ alwaysAvailable: v === "1" ? true : v === "0" ? false : null })}
              options={[
                { value: "", label: "Any" },
                { value: "1", label: "Always available" },
                { value: "0", label: "Not always available" },
              ]}
            />
          </Field>
          <label className="flex items-center gap-2.5 text-[13px] text-body">
            <input type="checkbox" checked={draft.onSale ?? false} onChange={(e) => set({ onSale: e.target.checked || undefined })} className="size-4 accent-[var(--sz-primary-700)]" />
            On sale only
          </label>
          <label className="flex items-center gap-2.5 text-[13px] text-body">
            <input type="checkbox" checked={draft.hasImage ?? false} onChange={(e) => set({ hasImage: e.target.checked || undefined })} className="size-4 accent-[var(--sz-primary-700)]" />
            Has a photo
          </label>
        </div>

        <div className="flex gap-2.5 border-t border-line px-4 py-3.5">
          <button type="button" onClick={onClear} className="min-h-11 flex-1 rounded-[var(--sz-admin-radius-control)] border border-line text-[13px] font-semibold text-body hover:border-primary-700">
            Clear all
          </button>
          <button type="button" onClick={onApply} className="min-h-11 flex-1 rounded-[var(--sz-admin-radius-control)] bg-primary-700 text-[13px] font-semibold text-white hover:bg-primary-800">
            Apply
          </button>
        </div>
      </aside>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-body">{label}</p>
      {children}
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="min-h-10 w-full rounded-[var(--sz-admin-radius-control)] border border-line bg-admin-canvas px-2.5 text-[13px] text-body outline-none focus-visible:border-primary-700"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function KebabIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}

/* --- active filter chips --------------------------------------------------- */

function buildChips(filters: DrawerFilters, q: string, options: AdminProductFilterOptions) {
  const chips: { key: keyof DrawerFilters | "q"; label: string }[] = [];
  if (q) chips.push({ key: "q", label: `“${q}”` });
  if (filters.status) chips.push({ key: "status", label: filters.status === "published" ? "Published" : "Draft" });
  if (filters.onSale) chips.push({ key: "onSale", label: "On sale" });
  if (filters.category) {
    const cat = options.categories.find((c) => c.value === filters.category);
    chips.push({ key: "category", label: cat?.label ?? filters.category });
  }
  if (filters.material) chips.push({ key: "material", label: filters.material });
  if (filters.purity) chips.push({ key: "purity", label: filters.purity });
  if (filters.tag) {
    const tag = options.tags.find((t) => t.value === filters.tag);
    chips.push({ key: "tag", label: tag?.label ?? `Tag ${filters.tag}` });
  }
  if (filters.alwaysAvailable === true) chips.push({ key: "alwaysAvailable", label: "Always available" });
  if (filters.alwaysAvailable === false) chips.push({ key: "alwaysAvailable", label: "Not always available" });
  if (filters.hasImage) chips.push({ key: "hasImage", label: "Has a photo" });
  return chips;
}
