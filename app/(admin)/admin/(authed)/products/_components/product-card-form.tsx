"use client";

import Image from "next/image";
import { useRef } from "react";
import { Icon } from "@/components/ui";
import { MultiSelect } from "@/components/admin/multi-select";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import type { ProductEditorOptions } from "@/lib/admin/catalog";
import type { EditorCard } from "./editor-model";
import { derivedName } from "./editor-model";

/**
 * One product card — the shared card from Sazuna Admin Products.dc.html.
 *
 * Transcribed from the spec's markup: the gold `#N` badge and the two selects in
 * the card bar (`.adx-cbar`), floating field labels that sit on the border
 * (`.adx-flab` / `.adx-fw`), 70px photo thumbs with their controls pinned
 * bottom-right, the two- and four-column field rows (`.adx-r2` / `.adx-r4`), and
 * the underlined `.adx-mini` auto-price control.
 *
 * Presentational: every change is handed up as a patch so the orchestrator owns
 * the card list, the debounced lookups and the save. The one deviation from the
 * mock is Category, which is the spec's own multi-select popover rather than its
 * single dropdown, because a product sits in several categories and the
 * storefront browses the whole tree.
 */

export type EditorMode = "add" | "edit";

/** `.adx-cf` — 13px on white, 42px tall, gold focus border. */
const fieldClass =
  "min-h-[42px] w-full rounded-lg border border-line bg-raised px-2.5 text-[13px] text-heading outline-none placeholder:text-muted focus-visible:border-accent focus-visible:shadow-[var(--sz-ring-focus-soft)]";

function unique(values: (string | undefined | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v))];
}

export interface CardHandlers {
  patch: (patch: Partial<EditorCard>) => void;
  /** A field the admin edited by hand — marks it typed, so autofill leaves it. */
  edit: (patch: Partial<EditorCard>) => void;
  onSkuChange: (value: string) => void;
  onPriceChange: (value: string) => void;
  useRulePrice: () => void;
  useSheetValues: () => void;
  duplicate: () => void;
  remove: () => void;
  addPhotos: (files: FileList | null) => void;
  setCover: (index: number) => void;
  removePhoto: (index: number) => void;
}

export function ProductCardForm({
  card,
  index,
  mode,
  options,
  uploading,
  handlers,
}: {
  card: EditorCard;
  index: number;
  mode: EditorMode;
  options: ProductEditorOptions;
  uploading: boolean;
  handlers: CardHandlers;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const materialOptions = unique([card.material, ...options.materials]);
  const purityOptions = unique([card.purity, ...options.purities]);
  const categoryLabel = (id: string) => options.categories.find((c) => String(c.id) === id)?.name ?? "";
  const locked = card.status === "saved" || card.status === "saving";

  const badge = mode === "edit" ? "EDIT" : `#${index + 1}`;
  const removeText = mode === "edit" ? "Reset" : "Remove this card";
  const label = card.name.trim() || card.sku.trim() || `card ${index + 1}`;

  // The spec's `showAuto`: only once the admin has overridden the price, a rule
  // price exists, and the two disagree. Offering "Auto: रु X" against the number
  // the rule itself just wrote would be noise.
  const showAuto = card.saleOverride && card.rulePrice !== null && card.rulePrice !== card.salePrice;

  return (
    <div
      className={cn(
        "rounded-xl border bg-raised",
        card.status === "failed" ? "border-error-border" : "border-line",
        card.status === "saved" && "opacity-[.72]",
      )}
    >
      {/* Card bar — .adx-cbar */}
      <div className="flex flex-wrap items-center gap-[9px] rounded-t-[11px] border-b border-line-soft bg-canvas px-[11px] pb-[9px] pt-[13px]">
        <span className="shrink-0 rounded-[5px] bg-warning-soft px-[7px] py-1 font-mono text-[10px] font-semibold tracking-[.07em] text-accent-strong">
          {badge}
        </span>

        <BarSelect
          label="Material"
          value={card.material}
          disabled={locked}
          onChange={(value) => handlers.edit({ material: value })}
          options={materialOptions}
        />
        <BarSelect
          label="Purity"
          mono
          value={card.purity}
          disabled={locked}
          onChange={(value) => handlers.edit({ purity: value, origin: { ...card.origin, purity: "typed" } })}
          options={purityOptions}
        />

        {card.status === "failed" && (
          <span className="shrink-0 rounded-pill bg-error-soft px-[7px] py-[3px] text-[10px] font-semibold text-error">
            Failed
          </span>
        )}
        {card.status === "saved" && (
          <span className="shrink-0 rounded-pill bg-success-soft px-[7px] py-[3px] text-[10px] font-semibold text-success">
            Saved
          </span>
        )}
        {card.status === "saving" && (
          <span className="shrink-0 rounded-pill bg-raised px-[7px] py-[3px] font-mono text-[10px] text-muted">
            Saving…
          </span>
        )}

        <span className="ml-auto flex shrink-0 items-center gap-1">
          {mode === "add" && (
            <button
              type="button"
              onClick={handlers.duplicate}
              disabled={locked}
              aria-label={`Duplicate ${label}`}
              title="Duplicate this card"
              className="inline-flex size-8 items-center justify-center rounded-[7px] text-muted hover:bg-surface hover:text-primary-700 disabled:opacity-[var(--sz-disabled-opacity)]"
            >
              <Icon name="copy" size={15} />
            </button>
          )}
          <button
            type="button"
            onClick={handlers.remove}
            disabled={card.status === "saving"}
            aria-label={`${removeText}: ${label}`}
            title={removeText}
            className="inline-flex size-8 items-center justify-center rounded-[7px] text-error hover:bg-error-soft disabled:opacity-[var(--sz-disabled-opacity)]"
          >
            <Icon name={mode === "edit" ? "refresh" : "trash"} size={15} />
          </button>
        </span>
      </div>

      <div className="flex flex-col gap-[13px] p-[13px]">
        {/* Photos */}
        <div>
          <p className="mb-[7px] font-mono text-[9.5px] font-semibold uppercase tracking-[.11em] text-muted">Photos</p>
          <div className="flex flex-wrap gap-2">
            {card.photos.map((photo, i) => (
              <div
                key={photo.url}
                className="relative size-[70px] shrink-0 overflow-hidden rounded-lg border-[1.5px] border-line bg-[radial-gradient(120%_120%_at_30%_25%,var(--sz-surface-raised),var(--sz-accent-soft))]"
              >
                <Image src={photo.url} alt="" width={70} height={70} unoptimized className="size-full object-cover" />
                {i === 0 && (
                  <span className="absolute left-[3px] top-[3px] rounded bg-primary-700 px-1 py-0.5 font-mono text-[7.5px] font-semibold tracking-[.1em] text-white">
                    COVER
                  </span>
                )}
                {photo.raw && (
                  <span className="absolute inset-x-0 bottom-0 bg-warning-soft/95 py-0.5 text-center font-mono text-[7.5px] text-[var(--sz-admin-gold-ink)]">
                    PROCESSING
                  </span>
                )}
                {!locked && !photo.raw && (
                  <span className="absolute bottom-[3px] right-[3px] flex gap-0.5">
                    {i !== 0 && (
                      <button
                        type="button"
                        onClick={() => handlers.setCover(i)}
                        aria-label={`Set photo ${i + 1} as cover`}
                        title="Set as cover"
                        className="inline-flex size-[21px] items-center justify-center rounded-[5px] bg-canvas/95 text-primary-700"
                      >
                        <Icon name="check" size={13} strokeWidth={2.5} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handlers.removePhoto(i)}
                      aria-label={`Remove photo ${i + 1}`}
                      title="Remove photo"
                      className="inline-flex size-[21px] items-center justify-center rounded-[5px] bg-canvas/95 text-error"
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </span>
                )}
              </div>
            ))}
            {!locked && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                aria-label={`Add photo to ${label}`}
                className="flex size-[70px] shrink-0 flex-col items-center justify-center gap-[3px] rounded-lg border-[1.5px] border-dashed border-line bg-canvas text-primary-700 hover:border-primary-700 hover:bg-primary-50 disabled:opacity-[var(--sz-disabled-opacity)]"
              >
                {uploading ? (
                  <span className="size-4 animate-spin rounded-pill border-2 border-line border-t-primary-700" />
                ) : (
                  <Icon name="plus" size={17} />
                )}
                <span className="text-[9.5px] font-semibold">{uploading ? "…" : "Add"}</span>
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                handlers.addPhotos(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        {/* Name. The spec hides this when adding; here it stays, optional, with
            the name it would derive as its placeholder — see editor-model.ts. */}
        <Fw label={mode === "add" ? "Product name" : "Product name *"} required={mode !== "add"} error={card.errors.name}>
          <input
            value={card.name}
            disabled={locked}
            onChange={(e) => handlers.edit({ name: e.target.value })}
            placeholder={
              mode === "add"
                ? derivedName(card, categoryLabel) || "Named from category and SKU if left blank"
                : "e.g. Solitaire Halo Ring"
            }
            aria-invalid={!!card.errors.name}
            className={cn(fieldClass, card.errors.name && "border-error")}
          />
        </Fw>

        {/* .adx-r2 — SKU + categories */}
        <div className="grid grid-cols-2 items-start gap-[11px]">
          <div>
            <Fw label="SKU *" required error={card.errors.sku}>
              <input
                value={card.sku}
                disabled={locked}
                onChange={(e) => handlers.onSkuChange(e.target.value)}
                placeholder="DGR-0000"
                aria-invalid={!!card.errors.sku}
                className={cn(fieldClass, "font-mono", card.errors.sku && "border-error")}
              />
            </Fw>
            {card.sheetRow && !locked && (
              <p className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-success">
                <Icon name="check" size={11} strokeWidth={2.5} />
                {card.sheetFilled ? "Weights & purity autofilled from inventory" : "This SKU is on the inventory sheet"}
                <button
                  type="button"
                  onClick={handlers.useSheetValues}
                  className="min-h-[30px] whitespace-nowrap text-[10px] font-semibold text-primary-700 underline"
                >
                  Use sheet values
                </button>
              </p>
            )}
          </div>
          <Fw label="Categories *" required error={card.errors.categories}>
            <MultiSelect
              ariaLabel="Categories"
              placeholder="Select categories…"
              options={options.categories.map((c) => ({ value: String(c.id), label: c.name }))}
              selected={card.categoryIds}
              onChange={(next) => handlers.edit({ categoryIds: next })}
            />
          </Fw>
        </div>

        {/* .adx-r2 — sale price + tags */}
        <div className="grid grid-cols-2 items-start gap-[11px]">
          <div>
            <Fw label="Sale price (रु) *" required error={card.errors.salePrice}>
              <input
                value={card.salePrice}
                disabled={locked}
                onChange={(e) => handlers.onPriceChange(e.target.value)}
                inputMode="decimal"
                placeholder="9999"
                aria-invalid={!!card.errors.salePrice}
                className={cn(fieldClass, "font-mono", card.errors.salePrice && "border-error")}
              />
            </Fw>
            {showAuto && (
              <button
                type="button"
                onClick={handlers.useRulePrice}
                className="mt-1 min-h-[30px] whitespace-nowrap text-[10px] font-semibold text-primary-700 underline"
              >
                Auto: {formatPrice(card.rulePrice)}
              </button>
            )}
          </div>
          <Fw label="Tags">
            <MultiSelect
              ariaLabel="Tags"
              placeholder="Select tags…"
              options={options.tags.map((t) => ({ value: String(t.id), label: t.name }))}
              selected={card.tagIds}
              onChange={(next) => handlers.edit({ tagIds: next })}
            />
          </Fw>
        </div>

        {/* .adx-r4 — weights */}
        <div className="grid grid-cols-4 gap-[11px]">
          <Weight
            label="Gross g"
            value={card.gross}
            placeholder="4.20"
            disabled={locked}
            onChange={(v) => handlers.edit({ gross: v, origin: { ...card.origin, gross: "typed" } })}
          />
          <Weight
            label="Net g *"
            required
            value={card.net}
            placeholder="3.85"
            disabled={locked}
            error={card.errors.netWeight}
            onChange={(v) => handlers.edit({ net: v, origin: { ...card.origin, net: "typed" } })}
          />
          <Weight
            label="Dia ct"
            value={card.diamond}
            placeholder="0.75"
            disabled={locked}
            onChange={(v) => handlers.edit({ diamond: v, origin: { ...card.origin, diamond: "typed" } })}
          />
          <Weight
            label="Stn ct"
            value={card.stone}
            placeholder="0.40"
            disabled={locked}
            onChange={(v) => handlers.edit({ stone: v, origin: { ...card.origin, stone: "typed" } })}
          />
        </div>

        {card.status === "failed" && card.failure && (
          <p role="alert" className="rounded-lg border border-error-border bg-error-soft px-[11px] py-[9px] text-[11.5px] text-error">
            {card.failure}
          </p>
        )}
        {card.status === "saved" && card.savedId !== null && (
          <p className="text-[11.5px] text-muted">
            Saved.{" "}
            <a href={`/admin/products/${card.savedId}/edit`} className="font-semibold text-primary-700">
              Open this product
            </a>
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * `.adx-fw` + `.adx-flab` — the spec's floating label, sitting on the field's
 * top border rather than above it. Required fields carry the darker ink.
 */
function Fw({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <span
        className={cn(
          "pointer-events-none absolute -top-1.5 left-2 z-[2] max-w-[calc(100%-18px)] truncate bg-raised px-[5px] text-[9.5px] font-semibold uppercase tracking-[.05em]",
          required ? "text-body" : "text-muted",
        )}
      >
        {label}
      </span>
      {children}
      {error && (
        <p className="mt-1 text-[10.5px] text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** `.adx-cbarsel` with its `.adx-flabbar` label — the card bar's compact select,
 *  whose floating label sits on the bar's own background rather than white. */
function BarSelect({
  label,
  value,
  options,
  disabled,
  mono,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  disabled: boolean;
  mono?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <span className="relative shrink-0">
      <span className="pointer-events-none absolute -top-1.5 left-2 z-[2] bg-canvas px-[5px] text-[9.5px] font-semibold uppercase tracking-[.05em] text-muted">
        {label}
      </span>
      <select
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "min-h-8 rounded-md border border-line bg-raised px-[5px] text-[11.5px] font-semibold text-body outline-none focus-visible:border-accent disabled:opacity-[var(--sz-disabled-opacity)]",
          mono && "font-mono",
        )}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </span>
  );
}

function Weight({
  label,
  required,
  value,
  placeholder,
  disabled,
  error,
  onChange,
}: {
  label: string;
  required?: boolean;
  value: string;
  placeholder: string;
  disabled: boolean;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Fw label={label} required={required} error={error}>
      <input
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        placeholder={placeholder}
        aria-invalid={!!error}
        className={cn(fieldClass, "font-mono", error && "border-error")}
      />
    </Fw>
  );
}
