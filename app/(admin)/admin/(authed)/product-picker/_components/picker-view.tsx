"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Icon, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import type { AdminProductListItem } from "@/lib/admin/product-projection";
import type { AdminProductFilterOptions, AdminProductPage } from "@/lib/admin/catalog";
import { fetchPickerPage } from "../_actions";

/**
 * Product Picker — Sazuna Admin Product Picker.dc.html.
 *
 * Tiles toggle into a selection that survives filtering (the map holds the items
 * themselves, not just ids, so the drawer and the tray can show pieces no longer
 * in view). From the tray: copy SKU + price for a chat, or share/download the
 * photos. Copy always works; share/download fetch the images and so depend on
 * them being reachable — same-origin processed AVIFs are, the legacy external
 * URLs may not be (they fail with the tray's error, not a crash).
 */

/** Share/download more than this and it gets unreliable; warn and cap the batch. */
const BATCH_CAP = 24;

export function PickerView({
  initial,
  options,
}: {
  initial: AdminProductPage;
  options: AdminProductFilterOptions;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = useState(initial.items);
  const [total, setTotal] = useState(initial.total);
  const [page, setPage] = useState(initial.page);
  const [q, setQ] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [category, setCategory] = useState("");
  const [material, setMaterial] = useState("");
  const [purity, setPurity] = useState("");
  const [sort, setSort] = useState("id_desc");
  const [selected, setSelected] = useState<Map<number, AdminProductListItem>>(new Map());
  const [filterOpen, setFilterOpen] = useState(false);
  const [selDrawerOpen, setSelDrawerOpen] = useState(false);
  const [busy, setBusy] = useState<null | "share" | "download">(null);
  const [pending, startTransition] = useTransition();

  const hasMore = items.length < total;
  const selectedList = [...selected.values()];
  const over = selectedList.length > BATCH_CAP;

  function load(next: { q: string; category: string; material: string; purity: string; sort: string }, nextPage: number, append: boolean) {
    startTransition(async () => {
      const result = await fetchPickerPage({
        q: next.q,
        category: next.category || undefined,
        material: next.material || undefined,
        purity: next.purity || undefined,
        sort: next.sort,
        page: nextPage,
      });
      setItems((current) => (append ? [...current, ...result.items] : result.items));
      setTotal(result.total);
      setPage(result.page);
    });
  }

  const filters = { q, category, material, purity, sort };
  function apply(patch: Partial<typeof filters>) {
    const next = { ...filters, ...patch };
    setQ(next.q);
    setCategory(next.category);
    setMaterial(next.material);
    setPurity(next.purity);
    setSort(next.sort);
    load(next, 1, false);
  }

  function toggle(item: AdminProductListItem) {
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(item.id)) next.delete(item.id);
      else next.set(item.id, item);
      return next;
    });
  }
  function selectAllLoaded() {
    setSelected((current) => {
      const next = new Map(current);
      for (const item of items) next.set(item.id, item);
      return next;
    });
  }
  function clearSelection() {
    setSelected(new Map());
    setSelDrawerOpen(false);
  }

  // --- tray actions ---
  function copyDetails() {
    const text = selectedList.map((p) => `💎 ${p.sku} — ${formatPrice(p.effectivePrice) ?? ""}`).join("\n");
    navigator.clipboard.writeText(text).then(
      () => toast("success", `Copied ${selectedList.length} ${selectedList.length === 1 ? "piece" : "pieces"}.`),
      () => toast("error", "Couldn't copy."),
    );
  }

  async function imagesToFiles(list: AdminProductListItem[]): Promise<File[]> {
    const files: File[] = [];
    for (const p of list) {
      if (!p.imageUrl) continue;
      const res = await fetch(p.imageUrl);
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
      files.push(new File([blob], `${p.sku}.${ext}`, { type: blob.type }));
    }
    return files;
  }

  function shareSelection() {
    const batch = selectedList.slice(0, BATCH_CAP);
    setBusy("share");
    (async () => {
      try {
        const files = await imagesToFiles(batch);
        const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
        if (nav.share && files.length > 0 && (!nav.canShare || nav.canShare({ files }))) {
          await nav.share({ files, title: "Sazuna pieces" });
        } else {
          downloadFiles(files);
        }
      } catch {
        toast("error", "Sharing didn't go through — the photos may be on an external host.");
      } finally {
        setBusy(null);
      }
    })();
  }

  function downloadFiles(files: File[]) {
    files.forEach((file, i) => {
      setTimeout(() => {
        const url = URL.createObjectURL(file);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
      }, i * 250);
    });
  }

  function downloadSelection() {
    const batch = selectedList.slice(0, BATCH_CAP);
    setBusy("download");
    (async () => {
      try {
        const files = await imagesToFiles(batch);
        if (files.length === 0) throw new Error("no images");
        downloadFiles(files);
        toast("success", `Downloading ${files.length} ${files.length === 1 ? "photo" : "photos"}.`);
      } catch {
        toast("error", "Download failed — the photos may be on an external host.");
      } finally {
        setBusy(null);
      }
    })();
  }

  function bulkEdit() {
    if (selectedList.length === 1) {
      router.push(`/admin/products/${selectedList[0].id}/edit`);
    } else {
      toast("info", "Bulk edit is coming soon — edit pieces one at a time for now.");
    }
  }

  return (
    <div className="mx-auto max-w-[1100px] pb-28">
      {/* Intro */}
      <div className="mb-4">
        <h2 className="font-display text-2xl font-medium text-heading">Product Picker</h2>
        <p className="mt-0.5 text-[13px] text-muted">
          Pick pieces, then share the photos or copy SKU &amp; price straight into a customer chat.
        </p>
      </div>

      {/* Search + filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            apply({ q: searchInput.trim() });
          }}
          className="relative min-w-[180px] flex-1"
        >
          <Icon name="search" size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search by SKU or name"
            placeholder="Search by SKU or name"
            className="min-h-10 w-full rounded-[var(--sz-admin-radius-control)] border border-line bg-raised pl-8 pr-3 text-[13px] text-body outline-none placeholder:text-muted focus-visible:border-primary-700"
          />
        </form>
        <button
          type="button"
          onClick={() => setFilterOpen(true)}
          className="inline-flex min-h-10 items-center gap-2 rounded-[var(--sz-admin-radius-control)] border border-line bg-raised px-3.5 text-[12.5px] font-semibold text-body hover:border-accent"
        >
          <Icon name="filter" size={15} /> Filters
        </button>
      </div>

      {/* Sticky count bar */}
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line-soft pb-2.5">
        <span className="font-mono text-[12px] text-muted">
          {total.toLocaleString("en-IN")} pieces
          {selected.size > 0 && <span className="text-primary-700"> · {selected.size} selected</span>}
        </span>
        <div className="ml-auto flex items-center gap-2 text-[12.5px] font-semibold">
          <button type="button" onClick={selectAllLoaded} className="text-primary-700 hover:underline">
            Select all
          </button>
          {selected.size > 0 && (
            <button type="button" onClick={clearSelection} className="text-muted hover:text-body">
              Deselect all
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      {items.length === 0 && !pending ? (
        <p className="py-16 text-center text-[13px] text-muted">No pieces match. Try a different search or filters.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {items.map((item) => {
            const on = selected.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggle(item)}
                aria-pressed={on}
                aria-label={`${item.name} — ${item.sku}`}
                className={cn(
                  "group overflow-hidden rounded-[var(--sz-admin-radius-card)] border bg-raised text-left transition-colors",
                  on ? "border-primary-700 ring-2 ring-primary-700/30" : "border-line hover:border-accent",
                )}
              >
                <span className="relative block aspect-square bg-admin-canvas">
                  {item.imageUrl && (
                    <Image src={item.imageUrl} alt="" fill unoptimized className="object-cover" sizes="200px" />
                  )}
                  <span
                    className={cn(
                      "absolute right-1.5 top-1.5 inline-flex size-6 items-center justify-center rounded-full border transition",
                      on ? "border-primary-700 bg-primary-700 text-white" : "border-white/70 bg-white/70 text-transparent",
                    )}
                  >
                    <Icon name="check" size={14} strokeWidth={3} />
                  </span>
                </span>
                <span className="block p-2">
                  <span className="flex items-center justify-between gap-1">
                    <span className="truncate font-mono text-[11px] text-body">{item.sku}</span>
                    <span className="shrink-0 font-mono text-[10.5px] text-muted">{item.purity || ""}</span>
                  </span>
                  <span className="mt-0.5 block font-mono text-[12px]">
                    {item.hasSale ? (
                      <>
                        <span className="font-semibold text-primary-700">{formatPrice(item.salePrice)}</span>{" "}
                        <span className="text-price-struck line-through">{formatPrice(item.price)}</span>
                      </>
                    ) : (
                      <span className="text-heading">{formatPrice(item.effectivePrice)}</span>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Load more */}
      <div className="mt-4 flex items-center justify-center gap-3">
        {hasMore && (
          <button
            type="button"
            onClick={() => load(filters, page + 1, true)}
            disabled={pending}
            className="inline-flex min-h-10 items-center rounded-[var(--sz-admin-radius-control)] border border-line bg-raised px-4 text-[12.5px] font-semibold text-primary-700 hover:border-primary-700 disabled:opacity-[var(--sz-disabled-opacity)]"
          >
            {pending ? "Loading…" : "Load more"}
          </button>
        )}
        <span className="font-mono text-[11.5px] text-muted">
          Showing {items.length.toLocaleString("en-IN")} of {total.toLocaleString("en-IN")}
        </span>
      </div>

      {/* Selection tray */}
      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-40 mx-auto w-[min(560px,calc(100vw-24px))] rounded-[var(--sz-admin-radius-card)] border border-line bg-raised px-3 py-2.5 shadow-[var(--sz-shadow-dropdown)] lg:left-[var(--sz-admin-side-w)] lg:mx-auto">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSelDrawerOpen(true)}
              className="mr-auto inline-flex items-center gap-1.5 rounded-[var(--sz-admin-radius-control)] px-2 py-1.5 text-[13px] font-semibold text-heading hover:bg-admin-canvas"
            >
              {selected.size} selected
              <Icon name="chevron-up" size={14} />
            </button>
            <TrayIcon label="Share" icon="share" tone="primary" busy={busy === "share"} onClick={shareSelection} />
            <TrayIcon label="Copy SKU and price" icon="copy" onClick={copyDetails} />
            <TrayIcon label="Download photos" icon="box" busy={busy === "download"} onClick={downloadSelection} />
            <TrayIcon label="Bulk edit" icon="pricetag" onClick={bulkEdit} />
            <TrayIcon label="Clear selection" icon="close" onClick={clearSelection} />
          </div>
          {over && (
            <p role="status" className="mt-1.5 text-[11.5px] text-muted">
              Sharing and download use the first {BATCH_CAP} pieces.
            </p>
          )}
        </div>
      )}

      {/* Selection drawer */}
      {selDrawerOpen && (
        <SideDrawer title="Selection" subtitle={`${selected.size} selected`} onClose={() => setSelDrawerOpen(false)}>
          <div className="flex-1 space-y-1.5 overflow-y-auto px-4 py-3">
            {selectedList.map((p) => (
              <div key={p.id} className="flex items-center gap-2.5 rounded-[10px] border border-line-soft p-2">
                <span className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-admin-canvas">
                  {p.imageUrl && <Image src={p.imageUrl} alt="" fill unoptimized className="object-cover" sizes="40px" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[12px] text-body">{p.sku}</span>
                  <span className="font-mono text-[11.5px] text-muted">{formatPrice(p.effectivePrice)}</span>
                </span>
                <button type="button" onClick={() => toggle(p)} aria-label={`Remove ${p.sku}`} className="inline-flex size-8 items-center justify-center rounded-[7px] text-muted hover:bg-admin-canvas">
                  <Icon name="close" size={16} />
                </button>
              </div>
            ))}
          </div>
          <div className="border-t border-line px-4 py-3">
            <div className="flex gap-2.5">
              <button type="button" onClick={copyDetails} className="min-h-11 flex-1 rounded-[var(--sz-admin-radius-control)] border border-line text-[13px] font-semibold text-body hover:border-primary-700">
                Copy details
              </button>
              <button type="button" onClick={shareSelection} className="min-h-11 flex-1 rounded-[var(--sz-admin-radius-control)] bg-primary-700 text-[13px] font-semibold text-white hover:bg-primary-800">
                Share
              </button>
            </div>
            <button type="button" onClick={clearSelection} className="mt-2 w-full py-1.5 text-[12.5px] font-semibold text-muted hover:text-body">
              Clear selection
            </button>
          </div>
        </SideDrawer>
      )}

      {/* Filter drawer */}
      {filterOpen && (
        <SideDrawer title="Filters" onClose={() => setFilterOpen(false)}>
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <Select label="Sort by" value={sort} onChange={(v) => setSort(v)} options={[
              { value: "id_desc", label: "Newest first" },
              { value: "price_asc", label: "Price low–high" },
              { value: "price_desc", label: "Price high–low" },
              { value: "name_asc", label: "Name A–Z" },
            ]} />
            <Select label="Category" value={category} onChange={setCategory} options={[{ value: "", label: "All categories" }, ...options.categories]} />
            <Select label="Material" value={material} onChange={setMaterial} options={[{ value: "", label: "All materials" }, ...options.materials]} />
            <Select label="Purity" value={purity} onChange={setPurity} options={[{ value: "", label: "All purities" }, ...options.purities]} />
          </div>
          <div className="flex gap-2.5 border-t border-line px-4 py-3.5">
            <button type="button" onClick={() => { setCategory(""); setMaterial(""); setPurity(""); setSort("id_desc"); }} className="min-h-11 flex-1 rounded-[var(--sz-admin-radius-control)] border border-line text-[13px] font-semibold text-body hover:border-primary-700">
              Clear
            </button>
            <button type="button" onClick={() => { setFilterOpen(false); apply({}); }} className="min-h-11 flex-1 rounded-[var(--sz-admin-radius-control)] bg-primary-700 text-[13px] font-semibold text-white hover:bg-primary-800">
              Apply
            </button>
          </div>
        </SideDrawer>
      )}
    </div>
  );
}

function TrayIcon({
  label,
  icon,
  tone = "ghost",
  busy = false,
  onClick,
}: {
  label: string;
  icon: Parameters<typeof Icon>[0]["name"];
  tone?: "primary" | "ghost";
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-10 items-center justify-center rounded-[var(--sz-admin-radius-control)] disabled:opacity-[var(--sz-disabled-opacity)]",
        tone === "primary" ? "bg-primary-700 text-white hover:bg-primary-800" : "border border-line text-body hover:border-primary-700",
      )}
    >
      {busy ? <span className="size-4 animate-spin rounded-pill border-2 border-current/30 border-t-current" /> : <Icon name={icon} size={17} />}
    </button>
  );
}

function SideDrawer({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <button type="button" aria-label="Close" onClick={onClose} className="fixed inset-0 z-40 bg-[var(--sz-overlay)]" />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-[min(380px,100vw)] flex-col bg-raised shadow-[var(--sz-shadow-drawer)]">
        <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
          <div>
            <h3 className="font-display text-md font-medium text-heading">{title}</h3>
            {subtitle && <p className="font-mono text-[11px] text-muted">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="inline-flex size-8 items-center justify-center rounded-[7px] text-muted hover:bg-admin-canvas">
            <Icon name="close" size={18} />
          </button>
        </div>
        {children}
      </aside>
    </>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-body">{label}</p>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="min-h-10 w-full rounded-[var(--sz-admin-radius-control)] border border-line bg-admin-canvas px-2.5 text-[13px] text-body outline-none focus-visible:border-primary-700">
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
