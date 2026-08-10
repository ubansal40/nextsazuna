"use client";

import Image from "next/image";
import { Icon, useDialog, type IconName } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import type { AdminProductListItem } from "@/lib/admin/product-projection";
import { sumMoney } from "./picker-media";

/**
 * The picker's selection surfaces — Sazuna Admin Product Picker.dc.html
 * §Selection tray, §Selection drawer, §Filter drawer.
 *
 * Both drawers are native `<dialog>` elements opened with `showModal()`, so
 * focus trapping, Escape and the backdrop come from the platform rather than
 * from three hand-rolled effects (the house rule in CLAUDE.md, and the same
 * mechanism `ConfirmDialog` uses). They stay mounted and are driven by `open`,
 * because `useDialog` needs an element to call `showModal()` on.
 */

/* --- selection tray -------------------------------------------------------- */

export interface TrayProps {
  count: number;
  /** Spec `pkOver` — advisory text shown above the limit, in the tray and the drawer. */
  overText: string | null;
  busy: null | "share" | "download";
  shareError: string | null;
  downloadError: string | null;
  onOpenDrawer: () => void;
  onShare: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onBulkEdit: () => void;
  onClear: () => void;
}

export function PickerTray({
  count,
  overText,
  busy,
  shareError,
  downloadError,
  onOpenDrawer,
  onShare,
  onCopy,
  onDownload,
  onBulkEdit,
  onClear,
}: TrayProps) {
  return (
    // The spec centres the tray in the viewport; here it is centred in the
    // content column instead, so it never sits half-under the 246px sidebar.
    // The padding keeps the bar clear of a phone's home indicator.
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex justify-center px-2.5 pb-[max(10px,env(safe-area-inset-bottom))] lg:left-[var(--sz-admin-side-w)] min-[761px]:pb-[max(18px,env(safe-area-inset-bottom))]">
      <div
        role="region"
        aria-label="Selection actions"
        className="pointer-events-auto w-full rounded-[14px] bg-body text-white shadow-[var(--sz-shadow-modal)] min-[761px]:w-auto min-[761px]:min-w-[440px] min-[761px]:max-w-[calc(100%-40px)]"
      >
        <div className="flex items-center gap-[7px] py-2 pl-[13px] pr-[9px]">
          <button
            type="button"
            onClick={onOpenDrawer}
            className="flex min-h-10 min-w-0 flex-1 items-center gap-[7px] px-0.5 text-left text-[13.5px] font-semibold text-white"
          >
            {/* `min-w-0 truncate`, not `whitespace-nowrap`: this is the only
                flexible item in the bar and every sibling is `shrink-0`, so at
                375px there are about 62px for the label — a nowrap span kept
                its full width and painted straight over the Share button. */}
            <span className="min-w-0 truncate">{count} selected</span>
            <Icon name="chevron-up" size={15} />
          </button>

          <TrayButton
            label={busy === "share" ? "Preparing…" : "Share images"}
            icon="share"
            tone="primary"
            busy={busy === "share"}
            onClick={onShare}
          />
          <TrayButton label="Copy SKU and price for the selection" icon="copy" onClick={onCopy} />
          <TrayButton
            label={busy === "download" ? "Saving…" : "Download"}
            icon="box"
            busy={busy === "download"}
            onClick={onDownload}
          />
          <TrayButton label="Bulk edit the selection" icon="pricetag" onClick={onBulkEdit} />

          <span aria-hidden="true" className="mx-px h-[26px] w-px shrink-0 bg-canvas/15" />

          <button
            type="button"
            onClick={onClear}
            aria-label="Clear selection"
            title="Clear selection"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-[10px] text-canvas/65 hover:bg-canvas/10 hover:text-white"
          >
            <Icon name="close" size={17} />
          </button>
        </div>

        {overText && (
          <p role="status" className="mx-[13px] pb-2.5 text-[11px] leading-[1.45] text-accent-soft">
            {overText}
          </p>
        )}

        <TrayAlert message={shareError} actionLabel="Try again" onAction={onShare} />
        <TrayAlert message={downloadError} actionLabel="Try again" onAction={onDownload} />
      </div>
    </div>
  );
}

function TrayAlert({
  message,
  actionLabel,
  onAction,
}: {
  message: string | null;
  actionLabel: string;
  onAction: () => void;
}) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="mx-[13px] flex flex-wrap items-center gap-x-[9px] pb-2.5 text-[11.5px] leading-[1.45] text-primary-200"
    >
      {message}
      <button
        type="button"
        onClick={onAction}
        className="min-h-[34px] px-0.5 text-[11.5px] font-semibold text-accent-soft underline"
      >
        {actionLabel}
      </button>
    </div>
  );
}

function TrayButton({
  label,
  icon,
  tone = "ghost",
  busy = false,
  onClick,
}: {
  label: string;
  icon: IconName;
  tone?: "primary" | "ghost";
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-busy={busy || undefined}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-[11px] border max-[400px]:size-10 max-[400px]:rounded-[10px]",
        tone === "primary"
          ? "border-accent-soft bg-accent-soft text-body"
          : "border-canvas/15 text-accent-soft hover:bg-canvas/10",
      )}
    >
      {busy ? <Spinner tone={tone} /> : <Icon name={icon} size={17} />}
    </button>
  );
}

function Spinner({ tone }: { tone: "primary" | "ghost" }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-[15px] animate-spin rounded-pill border-[2.2px] border-t-current",
        tone === "primary" ? "border-body/30 text-body" : "border-accent-soft/30 text-accent-soft",
      )}
    />
  );
}

/* --- drawer shell ---------------------------------------------------------- */

/**
 * A right-hand drawer that becomes a full-width panel below the spec's 761px
 * breakpoint. `sheet` additionally drops it to a bottom sheet, which is what the
 * spec's `.adx-filtersheet` does to the filter drawer on a phone.
 */
function Drawer({
  open,
  label,
  width,
  sheet = false,
  onClose,
  children,
}: {
  open: boolean;
  label: string;
  width: string;
  sheet?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { ref, onBackdropClick } = useDialog(open, onClose);
  return (
    <dialog
      ref={ref}
      onClick={onBackdropClick}
      aria-label={label}
      className={cn(
        "mb-0 ml-auto mr-0 mt-0 h-dvh max-h-dvh max-w-none overflow-hidden border-0 bg-raised p-0 text-body shadow-drawer backdrop:bg-[var(--sz-overlay)]",
        width,
        "max-[760px]:ml-0 max-[760px]:w-full",
        sheet &&
          "max-[760px]:mt-auto max-[760px]:h-auto max-[760px]:max-h-[86dvh] max-[760px]:rounded-t-[16px]",
      )}
    >
      <div className="flex h-full flex-col">{children}</div>
    </dialog>
  );
}

function DrawerHeader({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-none items-center justify-between gap-2.5 border-b border-line px-4 py-3.5">
      <div className="min-w-0">
        <h2 className="font-display text-[17px] font-medium text-heading">{title}</h2>
        {subtitle && <p className="mt-0.5 font-mono text-[11px] text-muted-soft">{subtitle}</p>}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="inline-flex size-[38px] flex-none items-center justify-center rounded-[9px] bg-admin-canvas text-body hover:bg-surface"
      >
        <Icon name="close" size={18} />
      </button>
    </div>
  );
}

/* --- selection drawer ------------------------------------------------------ */

export function SelectionDrawer({
  open,
  items,
  overText,
  shareBusy,
  feedback,
  onClose,
  onRemove,
  onCopy,
  onShare,
  onClear,
}: {
  open: boolean;
  items: AdminProductListItem[];
  overText: string | null;
  shareBusy: boolean;
  /** The last action's result, drawn here because a toast cannot reach above a modal dialog. */
  feedback: { tone: "success" | "error"; message: string } | null;
  onClose: () => void;
  onRemove: (item: AdminProductListItem) => void;
  onCopy: () => void;
  onShare: () => void;
  onClear: () => void;
}) {
  // Spec `pkDrawerSub`: "N pieces · <total>". Summed exactly in integer
  // hundredths — a selection subtotal must not be a float.
  const subtotal = formatPrice(sumMoney(items.map((item) => item.effectivePrice)));
  const subtitle = `${items.length} ${items.length === 1 ? "piece" : "pieces"}${subtotal ? ` · ${subtotal}` : ""}`;

  return (
    <Drawer open={open} label="Selected products" width="w-[372px]" onClose={onClose}>
      <DrawerHeader title="Selection" subtitle={subtitle} onClose={onClose} />

      {overText && (
        <p
          role="status"
          className="mx-4 mt-3 flex-none rounded-[10px] border border-accent-soft bg-canvas px-[11px] py-[9px] text-[11.5px] leading-[1.5] text-[var(--sz-admin-gold-ink)]"
        >
          {overText}
        </p>
      )}

      <div className="flex-1 overflow-y-auto overscroll-contain px-2.5 pb-3.5 pt-2.5">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-[11px] rounded-[10px] px-1.5 py-[7px] hover:bg-canvas"
          >
            <PickerThumb src={item.imageUrl} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-[11.5px] text-muted">{item.sku}</span>
              <span className="mt-[3px] flex items-baseline gap-1.5 whitespace-nowrap font-mono">
                <span
                  className={cn(
                    "text-[12.5px] font-semibold tracking-[-.02em]",
                    item.hasSale ? "text-primary-700" : "text-heading",
                  )}
                >
                  {formatPrice(item.effectivePrice)}
                </span>
                {item.hasSale && (
                  <span className="text-[10.5px] text-price-struck line-through">
                    {formatPrice(item.price)}
                  </span>
                )}
              </span>
            </span>
            <button
              type="button"
              onClick={() => onRemove(item)}
              aria-label={`Remove ${item.name} from selection`}
              title="Remove"
              className="inline-flex size-10 flex-none items-center justify-center rounded-[9px] text-error hover:bg-error-soft"
            >
              <Icon name="close" size={17} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-none flex-col gap-2 border-t border-line px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3">
        {feedback && (
          <p
            role={feedback.tone === "error" ? "alert" : "status"}
            className={cn(
              "rounded-[9px] border px-[11px] py-2 text-[11.5px] leading-[1.5]",
              feedback.tone === "error"
                ? "border-error/25 bg-error-soft text-error"
                : "border-success/25 bg-success-soft text-success-ink",
            )}
          >
            {feedback.message}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCopy}
            className="min-h-[46px] flex-1 rounded-[9px] border border-line bg-raised text-[13px] font-semibold text-body hover:border-accent"
          >
            Copy details
          </button>
          <button
            type="button"
            onClick={onShare}
            aria-busy={shareBusy || undefined}
            className="inline-flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-[9px] bg-primary-700 text-[13px] font-semibold text-white hover:bg-primary-800"
          >
            {shareBusy && (
              <span
                aria-hidden="true"
                className="size-3.5 flex-none animate-spin rounded-pill border-[2.2px] border-white/35 border-t-white"
              />
            )}
            {shareBusy ? "Preparing…" : "Share images"}
          </button>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="min-h-10 p-2 text-xs font-semibold text-muted hover:text-error"
        >
          Clear selection
        </button>
      </div>
    </Drawer>
  );
}

/** The spec's gem-on-gradient product square, sized by its container. */
export function PickerThumb({ src, className }: { src: string | null; className?: string }) {
  return (
    <span
      className={cn(
        "relative flex flex-none items-center justify-center overflow-hidden",
        "bg-[radial-gradient(120%_120%_at_30%_25%,var(--sz-media-from),var(--sz-media-to))]",
        className ?? "size-[46px] rounded-[9px]",
      )}
    >
      {src ? (
        <Image src={src} alt="" fill unoptimized sizes="46px" className="object-cover" />
      ) : (
        <span aria-hidden="true" className="size-[14px] rotate-45 bg-accent opacity-50" />
      )}
    </span>
  );
}

/* --- filter drawer --------------------------------------------------------- */

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterGroup {
  key: string;
  label: string;
  options: FilterOption[];
}

export function FilterDrawer({
  open,
  groups,
  values,
  onChange,
  onClearAll,
  onApply,
  onClose,
}: {
  open: boolean;
  groups: FilterGroup[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onClearAll: () => void;
  onApply: () => void;
  onClose: () => void;
}) {
  return (
    <Drawer open={open} label="Filters" width="w-[340px]" sheet onClose={onClose}>
      <DrawerHeader title="Filters" onClose={onClose} />

      <div className="flex flex-1 flex-col gap-[13px] overflow-y-auto overscroll-contain p-4">
        {groups.map((group) => (
          <div key={group.key}>
            <label
              htmlFor={`picker-filter-${group.key}`}
              className="mb-1.5 block text-xs font-semibold text-heading"
            >
              {group.label}
            </label>
            <select
              id={`picker-filter-${group.key}`}
              value={values[group.key] ?? ""}
              onChange={(event) => onChange(group.key, event.target.value)}
              className="min-h-10 w-full rounded-[8px] border border-control-border bg-raised px-[11px] text-[13.5px] text-heading outline-none focus-visible:border-accent"
            >
              {group.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="flex flex-none gap-[9px] border-t border-line px-4 pb-[calc(13px+env(safe-area-inset-bottom))] pt-[13px]">
        <button
          type="button"
          onClick={onClearAll}
          className="min-h-11 flex-1 rounded-[8px] border border-line bg-raised text-[13px] font-semibold text-muted hover:border-accent"
        >
          Clear all
        </button>
        <button
          type="button"
          onClick={onApply}
          className="min-h-11 flex-1 rounded-[8px] bg-primary-700 text-[13px] font-semibold text-white hover:bg-primary-800"
        >
          Apply
        </button>
      </div>
    </Drawer>
  );
}
