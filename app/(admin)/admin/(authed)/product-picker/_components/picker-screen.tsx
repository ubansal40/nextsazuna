"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Icon, Skeleton, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import type { AdminProductListItem } from "@/lib/admin/product-projection";
import type { AdminProductFilterOptions, AdminProductPage } from "@/lib/admin/catalog";
import { loadPickerAction } from "../_actions";
import { SELECTION_ADVICE_LIMIT, SELECTION_BATCH_MAX, type PickerFilters } from "../_config";
import {
  copyDetails,
  countUnreachable,
  downloadImages,
  shareImages,
  LEGACY_IMAGE_HOST,
  skippedNote,
} from "./picker-media";
import { FilterDrawer, PickerTray, SelectionDrawer, type FilterGroup } from "./picker-tray";

/**
 * Product Picker — Sazuna Admin Product Picker.dc.html §1.
 *
 * A grid of the photographed catalogue for pulling pieces into a customer chat.
 * Two things carry the screen:
 *
 *  1. **The selection survives everything.** It is a Map of the items themselves,
 *     not a Set of ids, so a piece stays selected — and stays showable in the
 *     tray and the drawer — after the filters that found it have been changed,
 *     after paging past it, and after a failed reload (the spec's error panel
 *     promises exactly that: "your selection is kept").
 *  2. **Filtering is a server round-trip.** The spec filters a demo catalogue in
 *     memory; here every filter change re-queries, so the count, the chips and
 *     the grid can never disagree with the database.
 */

type FilterKey = "category" | "tag" | "material" | "purity" | "status";
type FilterState = Record<FilterKey, string>;

const NO_FILTERS: FilterState = { category: "", tag: "", material: "", purity: "", status: "" };

export function PickerScreen({
  initialPage,
  options,
}: {
  initialPage: AdminProductPage;
  options: AdminProductFilterOptions;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [items, setItems] = useState(initialPage.items);
  const [total, setTotal] = useState(initialPage.total);
  const [page, setPage] = useState(initialPage.page);

  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterState>(NO_FILTERS);

  const [selected, setSelected] = useState<Map<number, AdminProductListItem>>(new Map());
  const [mode, setMode] = useState<null | "replace" | "append">(null);
  const [error, setError] = useState<string | null>(null);

  const [filterOpen, setFilterOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [busy, setBusy] = useState<null | "share" | "download">(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  /**
   * The last action's outcome, mirrored for the selection drawer.
   *
   * The drawers are opened with `showModal()`, which puts them in the browser's
   * top layer — above everything, whatever the z-index. A toast fired from a
   * button inside the drawer therefore renders *behind* it and is never seen, so
   * the same message is also drawn inline where the click happened.
   */
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  const [, startTransition] = useTransition();
  const searchTimer = useRef<number | null>(null);
  /** What is currently applied. `apply` is the only writer, so it is never stale. */
  const applied = useRef<{ q: string; filters: FilterState }>({ q: "", filters: NO_FILTERS });
  /** The last request, so the error panel's "Try again" repeats it verbatim. */
  const lastRequest = useRef<{ q: string; filters: FilterState; page: number; mode: "replace" | "append" }>({
    q: "",
    filters: NO_FILTERS,
    page: 1,
    mode: "replace",
  });

  const groups = buildGroups(options);
  const chips = buildChips(groups, filters);
  const selectedList = [...selected.values()];
  const overLimit = selectedList.length > SELECTION_ADVICE_LIMIT;
  const overText = overLimit
    ? `${selectedList.length} pieces is a lot for one message — WhatsApp may compress or split it. Two smaller batches usually land better.`
    : null;

  /* --- loading ------------------------------------------------------------- */

  function load(nextQuery: string, nextFilters: FilterState, nextPage: number, nextMode: "replace" | "append") {
    lastRequest.current = { q: nextQuery, filters: nextFilters, page: nextPage, mode: nextMode };
    setMode(nextMode);
    startTransition(async () => {
      const result = await loadPickerAction(toPickerFilters(nextQuery, nextFilters, nextPage));
      setMode(null);
      if (!result.ok) {
        // A failed "Load more" leaves the rows that did arrive on screen and says
        // so in a toast; only a failed reload — where there is nothing truthful
        // left to show — takes over the body with the spec's error panel. Either
        // way `items` is untouched, so a successful retry never flashes empty.
        if (nextMode === "append") toast("error", result.error);
        else setError(result.error);
        return;
      }
      setError(null);
      setItems((current) => (nextMode === "append" ? [...current, ...result.page.items] : result.page.items));
      setTotal(result.page.total);
      setPage(result.page.page);
    });
  }

  function retry() {
    const last = lastRequest.current;
    load(last.q, last.filters, last.page, last.mode);
  }

  /**
   * Every change to what is being looked at goes through here, so the filters
   * the server sees and the ones the toolbar shows can never drift apart. It
   * also cancels any pending debounce: a filter chosen mid-keystroke must not be
   * undone 350ms later by a timer holding the filters from before it.
   */
  function apply(nextQuery: string, nextFilters: FilterState) {
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    applied.current = { q: nextQuery, filters: nextFilters };
    setQuery(nextQuery);
    setFilters(nextFilters);
    load(nextQuery, nextFilters, 1, "replace");
  }

  function onSearchChange(value: string) {
    setSearchInput(value);
    // Debounced with a ref'd timer rather than an effect: the timer *is* the
    // whole mechanism, and an effect would only add a dependency list to get
    // wrong. It reads the filters from `applied`, which `apply` keeps current.
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => apply(value.trim(), applied.current.filters), 350);
  }

  function submitSearch() {
    apply(searchInput.trim(), filters);
  }

  function clearSearch() {
    setSearchInput("");
    apply("", filters);
  }

  function setFilter(key: string, value: string) {
    apply(query, { ...filters, [key as FilterKey]: value });
  }

  function removeChip(key: FilterKey) {
    apply(query, { ...filters, [key]: "" });
  }

  /** Spec `pClearFilters` — clears the query too, which is what "Clear all" means here. */
  function clearFilters() {
    setSearchInput("");
    apply("", NO_FILTERS);
  }

  /* --- selection ----------------------------------------------------------- */

  function toggle(item: AdminProductListItem) {
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(item.id)) next.delete(item.id);
      else next.set(item.id, item);
      return next;
    });
  }

  function selectAll() {
    const next = new Map(selected);
    for (const item of items) next.set(item.id, item);
    setSelected(next);
    toast("success", `${next.size} ${next.size === 1 ? "piece" : "pieces"} selected.`);
  }

  function clearSelection() {
    setSelected(new Map());
    setDrawerOpen(false);
    setShareError(null);
    setDownloadError(null);
    toast("success", "Selection cleared.");
  }

  /* --- tray actions -------------------------------------------------------- */

  /** Say it in a toast for the grid, and inline for the drawer's top layer. */
  function announce(tone: "success" | "error", message: string) {
    setFeedback({ tone, message });
    toast(tone, message);
  }

  async function onCopy() {
    const ok = await copyDetails(selectedList);
    if (ok) {
      announce(
        "success",
        `Copied ${selectedList.length} ${selectedList.length === 1 ? "line" : "lines"} of details.`,
      );
    } else {
      announce("error", "Couldn't reach the clipboard — check the browser's permissions.");
    }
  }

  /** Both media actions share this guard, spinner and reporting. */
  function runMedia(kind: "share" | "download") {
    if (busy) return;
    // Each action owns its own inline alert in the tray, so a failed share does
    // not blame the download button.
    const setInlineError = kind === "share" ? setShareError : setDownloadError;
    const fail = (message: string) => {
      setInlineError(message);
      setFeedback({ tone: "error", message });
    };
    setInlineError(null);
    setFeedback(null);

    if (selectedList.length > SELECTION_BATCH_MAX) {
      fail(
        `${kind === "share" ? "Sharing" : "Downloading"} handles up to ${SELECTION_BATCH_MAX} pieces at a time. Deselect ${selectedList.length - SELECTION_BATCH_MAX} and try again.`,
      );
      return;
    }

    setBusy(kind);
    void (async () => {
      const outcome = kind === "share" ? await shareImages(selectedList) : await downloadImages(selectedList);
      setBusy(null);
      if (outcome.kind === "cancelled") return;
      if (outcome.kind === "failed") {
        fail(outcome.message);
        return;
      }
      const verb = outcome.kind === "shared" ? "shared" : "downloaded";
      const noun = outcome.count === 1 ? "image" : "images";
      announce(
        "success",
        `${outcome.count} ${noun} ${verb}${outcome.skipped > 0 ? skippedNote(outcome.skipped) : ""}.`,
      );
    })();
  }

  function bulkEdit() {
    // The receiving screen is the shared product editor; the picker's only job
    // is to hand it the selection.
    router.push(`/admin/products/bulk?ids=${selectedList.map((item) => item.id).join(",")}`);
  }

  /* --- render -------------------------------------------------------------- */

  // Told before the click, not only after it: on this catalogue almost every
  // photo is still on the legacy host, so "Share" failing is the norm, not the
  // exception, and the drawer is where the operator can see it coming.
  const stranded = countUnreachable(selectedList);
  const strandedText =
    stranded > 0
      ? `${stranded} of these ${stranded === 1 ? "photo is" : "photos are"} still hosted on ${LEGACY_IMAGE_HOST}, so ${stranded === 1 ? "it" : "they"} can't be shared or downloaded from here.`
      : null;
  const replacing = mode === "replace";
  const showBody = !replacing && !error;
  const empty = showBody && items.length === 0;
  const canClear = chips.length > 0 || query.length > 0;

  return (
    <div className="mx-auto max-w-[1180px] pb-24">
      <div className="mb-0.5">
        <h2 className="font-display text-[23px] font-medium text-heading">Product Picker</h2>
        <p className="mt-1 max-w-[52ch] text-[12.5px] text-muted">
          Pick pieces, then share the photos or copy SKU &amp; price straight into a customer chat.
        </p>
      </div>

      {/* Sticky toolbar. The spec puts search and Filters in the topbar, which
          the shared AdminShell owns; keeping them sticky here preserves the one
          property that mattered — both stay reachable while the grid scrolls. */}
      <div className="sticky top-[60px] z-[18] -mx-4 mb-3 bg-admin-canvas px-4 pt-2.5 sm:-mx-[18px] sm:px-[18px]">
        <div className="flex items-center gap-[7px]">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submitSearch();
            }}
            role="search"
            className="relative min-w-0 flex-1 sm:max-w-[400px]"
          >
            <Icon
              name="search"
              size={16}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-soft"
            />
            <input
              value={searchInput}
              onChange={(event) => onSearchChange(event.target.value)}
              aria-label="Search by SKU or name"
              placeholder="Search by SKU or name…"
              className="min-h-10 w-full rounded-[var(--sz-admin-radius-control)] border border-line bg-admin-canvas px-8 text-[13px] text-heading outline-none placeholder:text-muted-soft focus-visible:border-accent"
            />
            {searchInput.length > 0 && (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Clear search"
                className="absolute right-1 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-[8px] text-muted hover:text-body"
              >
                <Icon name="close" size={15} />
              </button>
            )}
          </form>

          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            aria-label="Filters"
            title="Filters"
            className={cn(
              "inline-flex min-h-10 flex-none items-center justify-center gap-[7px] rounded-[var(--sz-admin-radius-control)] border px-[11px] text-[12.5px] font-semibold text-body hover:border-accent",
              chips.length > 0 ? "border-primary-200 bg-primary-50" : "border-line bg-raised",
            )}
          >
            <Icon name="filter" size={15} />
            {chips.length > 0 && (
              <span className="rounded-pill bg-primary-700 px-1.5 py-px font-mono text-[10px] font-semibold text-white">
                {chips.length}
              </span>
            )}
          </button>
        </div>

        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-[7px] px-px pt-[9px]">
            {chips.map((chip) => (
              <span
                key={chip.key}
                className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-raised py-[5px] pl-[11px] pr-[6px] text-[11.5px] font-medium text-body"
              >
                {chip.label}
                <button
                  type="button"
                  onClick={() => removeChip(chip.key)}
                  aria-label={`Remove ${chip.groupLabel} filter`}
                  className="inline-flex size-[22px] items-center justify-center rounded-pill bg-surface text-muted hover:text-body"
                >
                  <Icon name="close" size={12} />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={clearFilters}
              className="min-h-[38px] px-1 py-[7px] text-[11.5px] font-semibold text-primary-700 underline"
            >
              Clear all
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-px py-[9px]">
          <span className="font-mono text-[11.5px] text-muted-soft">
            {total.toLocaleString("en-IN")} {total === 1 ? "piece" : "pieces"}
          </span>
          {selectedList.length > 0 && (
            <span className="font-mono text-[11.5px] font-semibold text-primary-700">
              · {selectedList.length} selected
            </span>
          )}
          <span className="ml-auto flex items-center gap-0.5">
            <button
              type="button"
              onClick={selectAll}
              disabled={items.length === 0}
              title="Select every piece loaded so far"
              className="min-h-10 px-[7px] py-2 text-[11.5px] font-semibold text-primary-700 underline disabled:opacity-[var(--sz-disabled-opacity)] disabled:no-underline"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={clearSelection}
              disabled={selectedList.length === 0}
              className="min-h-10 px-[7px] py-2 text-[11.5px] font-semibold text-muted underline disabled:opacity-[var(--sz-disabled-opacity)] disabled:no-underline"
            >
              Deselect all
            </button>
          </span>
        </div>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {selectedList.length > 0
          ? `${selectedList.length} ${selectedList.length === 1 ? "piece" : "pieces"} selected`
          : "Nothing selected"}
      </p>

      {replacing && <TileSkeletons count={8} label="Loading products" />}

      {error && (
        <StatePanel
          tone="error"
          icon="alert"
          title="Couldn't load the catalogue"
          body="Check the connection and try again — your selection is kept."
          actionLabel="Try again"
          onAction={retry}
        />
      )}

      {empty && (
        <StatePanel
          tone="neutral"
          icon="gem"
          title={canClear ? "Nothing matches" : "No photographed products yet"}
          body={
            canClear
              ? "Try a different SKU, or clear a filter to widen the search."
              : "The picker only shows pieces that have a photo. Add one to a product and it appears here."
          }
          actionLabel={canClear ? "Clear filters" : undefined}
          onAction={canClear ? clearFilters : undefined}
        />
      )}

      {showBody && items.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-2.5 min-[761px]:grid-cols-3 min-[761px]:gap-[13px] min-[1101px]:grid-cols-4">
            {items.map((item) => (
              <Tile key={item.id} item={item} on={selected.has(item.id)} onToggle={() => toggle(item)} />
            ))}
            {mode === "append" && <TileSkeletons count={4} inline />}
          </div>

          <div className="flex flex-col items-center gap-[9px] pb-2 pt-4">
            {items.length < total && (
              <button
                type="button"
                onClick={() => load(query, filters, page + 1, "append")}
                disabled={mode !== null}
                className="min-h-11 rounded-[var(--sz-admin-radius-control)] border border-line bg-raised px-5 text-[12.5px] font-semibold text-primary-700 hover:border-primary-700 hover:bg-primary-50 disabled:opacity-[var(--sz-disabled-opacity)]"
              >
                {mode === "append" ? "Loading…" : "Load more"}
              </button>
            )}
            <span className="font-mono text-[11px] text-muted-soft">
              Showing {items.length.toLocaleString("en-IN")} of {total.toLocaleString("en-IN")}
            </span>
          </div>
        </>
      )}

      {selectedList.length > 0 && (
        <PickerTray
          count={selectedList.length}
          overText={overText}
          busy={busy}
          shareError={shareError}
          downloadError={downloadError}
          onOpenDrawer={() => {
            setFeedback(null);
            setDrawerOpen(true);
          }}
          onShare={() => runMedia("share")}
          onCopy={onCopy}
          onDownload={() => runMedia("download")}
          onBulkEdit={bulkEdit}
          onClear={clearSelection}
        />
      )}

      <SelectionDrawer
        open={drawerOpen && selectedList.length > 0}
        items={selectedList}
        // Both advisories can be true at once, and neither replaces the other:
        // one is about message size, the other about which photos exist here at
        // all. The drawer is the one surface with room to say both.
        overText={[overText, strandedText].filter(Boolean).join(" ") || null}
        shareBusy={busy === "share"}
        feedback={feedback}
        onClose={() => setDrawerOpen(false)}
        onRemove={toggle}
        onCopy={onCopy}
        onShare={() => runMedia("share")}
        onClear={clearSelection}
      />

      <FilterDrawer
        open={filterOpen}
        groups={groups}
        values={filters}
        onChange={setFilter}
        onClearAll={() => {
          setFilterOpen(false);
          clearFilters();
          toast("success", "Filters cleared.");
        }}
        onApply={() => {
          setFilterOpen(false);
          // Each select already re-queried, so Apply only confirms the result.
          // While one of those queries is still in flight `total` is last
          // request's answer, and quoting it would be a lie — say nothing.
          if (mode === null) {
            toast("info", `${total.toLocaleString("en-IN")} ${total === 1 ? "piece" : "pieces"} match.`);
          }
        }}
        onClose={() => setFilterOpen(false)}
      />
    </div>
  );
}

/* --- tile ------------------------------------------------------------------ */

function Tile({
  item,
  on,
  onToggle,
}: {
  item: AdminProductListItem;
  on: boolean;
  onToggle: () => void;
}) {
  const price = formatPrice(item.effectivePrice) ?? "—";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={`${item.name}, ${item.sku}, ${price}, ${on ? "selected" : "not selected"}`}
      className={cn(
        "block w-full overflow-hidden rounded-[12px] border-[1.5px] bg-raised p-0 text-left transition-[border-color,box-shadow] duration-[var(--sz-dur-fast)]",
        on
          ? "border-primary-700 bg-primary-50 shadow-[0_0_0_3px_rgb(var(--sz-primary-700-rgb)/.09)]"
          : "border-line hover:border-accent",
      )}
    >
      <span className="relative block aspect-square w-full bg-[radial-gradient(120%_120%_at_30%_25%,var(--sz-media-from),var(--sz-media-to))]">
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt=""
            fill
            unoptimized
            loading="eager"
            sizes="(min-width: 1101px) 280px, (min-width: 761px) 33vw, 50vw"
            className="object-cover"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center">
            <span aria-hidden="true" className="aspect-square w-[26%] rotate-45 bg-accent opacity-[.42]" />
          </span>
        )}
        <span
          aria-hidden="true"
          className={cn(
            "absolute left-[7px] top-[7px] inline-flex size-[26px] items-center justify-center rounded-[8px] border-[1.5px] text-white shadow-xs",
            on ? "border-primary-700 bg-primary-700" : "border-control-border bg-raised/90",
          )}
        >
          {on && <Icon name="check" size={14} strokeWidth={3} />}
        </span>
      </span>

      <span className="block px-2.5 pb-2.5 pt-2">
        <span className="flex items-center justify-between gap-1.5">
          <span className="truncate font-mono text-[11px] text-muted">{item.sku}</span>
          {item.purity && (
            <span className="flex-none rounded-xs bg-warning-soft px-[5px] py-0.5 font-mono text-[9.5px] font-semibold text-[var(--sz-admin-gold-ink)]">
              {item.purity}
            </span>
          )}
        </span>
        <span className="mt-1.5 flex items-baseline gap-1.5 overflow-hidden whitespace-nowrap font-mono">
          <span
            className={cn(
              "text-[13px] font-semibold tracking-[-.02em]",
              item.hasSale ? "text-primary-700" : "text-heading",
            )}
          >
            {price}
          </span>
          {item.hasSale && (
            <span className="text-[10.5px] text-price-struck line-through">{formatPrice(item.price)}</span>
          )}
        </span>
      </span>
    </button>
  );
}

/* --- states ---------------------------------------------------------------- */

function TileSkeletons({ count, label, inline = false }: { count: number; label?: string; inline?: boolean }) {
  const tiles = Array.from({ length: count }, (_, index) => (
    <div key={index} aria-hidden={inline || undefined} className="overflow-hidden rounded-[12px] border border-line bg-raised">
      <Skeleton className="aspect-square w-full rounded-none" />
      <span className="block p-[9px]">
        <Skeleton className="mb-[7px] h-3 w-[62%]" />
        <Skeleton className="h-3 w-[44%]" />
      </span>
    </div>
  ));

  if (inline) return <>{tiles}</>;
  return (
    <div
      aria-busy="true"
      aria-label={label}
      className="grid grid-cols-2 gap-2.5 min-[761px]:grid-cols-3 min-[761px]:gap-[13px] min-[1101px]:grid-cols-4"
    >
      {tiles}
    </div>
  );
}

function StatePanel({
  tone,
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  tone: "error" | "neutral";
  icon: "alert" | "gem";
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-[var(--sz-admin-radius-card)] border border-line bg-raised px-5 py-[54px] text-center">
      <span
        className={cn(
          "inline-flex size-[46px] items-center justify-center rounded-pill",
          tone === "error" ? "bg-error-soft text-error" : "bg-admin-canvas text-accent-strong",
        )}
      >
        <Icon name={icon} size={22} />
      </span>
      <p className="mt-[13px] font-display text-md font-medium text-heading">{title}</p>
      <p className="mx-auto mt-[7px] max-w-[38ch] text-[13px] text-muted">{body}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-[15px] min-h-11 rounded-[8px] bg-primary-700 px-5 text-[13px] font-semibold text-white hover:bg-primary-800"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/* --- filters --------------------------------------------------------------- */

/**
 * The spec's filter drawer is shared with the products table and lists eight
 * groups. Five of them are what the admin read layer can actually answer:
 * Collection, Accent Gemstone and Stock have no column or join behind them, so
 * they are left out rather than rendered as controls that quietly do nothing.
 */
function buildGroups(options: AdminProductFilterOptions): FilterGroup[] {
  return [
    {
      key: "category",
      label: "Category",
      options: [{ value: "", label: "All categories" }, ...options.categories],
    },
    {
      key: "tag",
      label: "Tag",
      options: [
        { value: "", label: "All tags" },
        ...options.tags.map((tag) => ({ value: String(tag.value), label: tag.label })),
      ],
    },
    {
      key: "material",
      label: "Material",
      options: [{ value: "", label: "All materials" }, ...options.materials],
    },
    {
      key: "purity",
      label: "Purity",
      options: [{ value: "", label: "All purities" }, ...options.purities],
    },
    {
      key: "status",
      label: "Status",
      options: [
        { value: "", label: "All statuses" },
        { value: "published", label: "Active" },
        { value: "draft", label: "Draft" },
      ],
    },
  ];
}

interface Chip {
  key: FilterKey;
  groupLabel: string;
  label: string;
}

/** Spec `pChips` — one chip per filter that is actually narrowing the grid. */
function buildChips(groups: FilterGroup[], filters: FilterState): Chip[] {
  const chips: Chip[] = [];
  for (const group of groups) {
    const value = filters[group.key as FilterKey];
    if (!value) continue;
    const option = group.options.find((candidate) => candidate.value === value);
    chips.push({
      key: group.key as FilterKey,
      groupLabel: group.label,
      label: `${group.label}: ${option?.label ?? value}`,
    });
  }
  return chips;
}

function toPickerFilters(query: string, filters: FilterState, page: number): PickerFilters {
  return {
    q: query || undefined,
    category: filters.category || undefined,
    tag: filters.tag ? Number(filters.tag) : undefined,
    material: filters.material || undefined,
    purity: filters.purity || undefined,
    status: (filters.status as "published" | "draft" | "") || undefined,
    page,
  };
}
