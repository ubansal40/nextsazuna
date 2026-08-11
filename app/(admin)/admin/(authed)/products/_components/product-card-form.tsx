"use client";

import Image from "next/image";
import { useId, useRef, useState } from "react";
import { Icon } from "@/components/ui";
import { MultiSelect } from "@/components/admin/multi-select";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { MAX_PRODUCT_PHOTOS } from "@/lib/admin/product-limits";
import type { ProductEditorOptions } from "@/lib/admin/catalog";
import { withCurrentValue, type VocabOption } from "@/lib/admin/vocab-options";
import { skuLocked, type EditorCard } from "./editor-model";

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

/** `.adx-cf` — 13px on white, 42px tall, gold focus border. The ring itself is
 *  the global `:focus-visible` rule's; a field never restyles it. */
const fieldClass =
  "min-h-[42px] w-full rounded-lg border border-line bg-raised px-2.5 text-[13px] text-heading outline-none placeholder:text-muted focus-visible:border-accent";

/**
 * The photo drag's payload type.
 *
 * Firefox refuses to start a drag unless `setData` is called, but a
 * `text/plain` payload makes every text input on the card a valid drop target:
 * releasing a tile over Sale price typed the tile's index into the field AND
 * set `saleOverride`, permanently switching that card off rule pricing — while
 * the photo itself did not move. A private type still satisfies Firefox and is
 * something no form field will accept.
 */
const PHOTO_DRAG_TYPE = "application/x-sazuna-photo-index";

export interface CardHandlers {
  patch: (patch: Partial<EditorCard>) => void;
  /** A field the admin edited by hand — marks it typed, so autofill leaves it. */
  edit: (patch: Partial<EditorCard>) => void;
  onSkuChange: (value: string) => void;
  onPriceChange: (value: string) => void;
  /** Rounds the price to whole rupees once the field is left. */
  onPriceBlur: () => void;
  useRulePrice: () => void;
  useSheetValues: () => void;
  duplicate: () => void;
  remove: () => void;
  addPhotos: (files: FileList | null) => void;
  movePhoto: (from: number, to: number) => void;
  removePhoto: (index: number) => void;
}

export function ProductCardForm({
  card,
  index,
  mode,
  options,
  handlers,
}: {
  card: EditorCard;
  index: number;
  mode: EditorMode;
  options: ProductEditorOptions;
  handlers: CardHandlers;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  /**
   * `useId`, not the card key.
   *
   * Card keys are minted with `Math.random()`, and the editor's `useState`
   * initialiser runs on the server AND again on the client — so the two produce
   * different keys and React reports a hydration mismatch on this very
   * attribute. `useId` is stable across both renders, which is exactly what an
   * id used by `aria-describedby` has to be.
   */
  const lockNoteId = useId();
  /*
   * The taxonomy, in the order the owner arranged it — plus whatever this
   * product already carries, if that is no longer part of it. 752 products are
   * still on "Gold", which is in no vocabulary; dropping it from the list would
   * make the select display "—" and turn a save into a silent erasure of the
   * material on a product nobody meant to touch.
   */
  const materialOptions = withCurrentValue(options.materials, card.material);
  const purityOptions = withCurrentValue(options.purities, card.purity);
  const locked = card.status === "saved" || card.status === "saving";

  const hasSku = card.sku.trim().length > 0;
  const photosFull = card.photos.length >= MAX_PRODUCT_PHOTOS;
  // The SKU is stamped into the photos and the originals are not kept, so it
  // stops being editable the moment there is a photo to disagree with.
  const lockSku = locked || skuLocked(card);

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
          <div className="mb-[7px] flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[.11em] text-muted">Photos</p>
            {card.photos.length > 1 && (
              <p className="text-[10px] text-muted">Drag to reorder — the first is the cover.</p>
            )}
          </div>
          <div role="list" className="flex flex-wrap gap-2">
            {card.photos.map((photo, i) => (
              <div
                key={photo.id}
                role="listitem"
                tabIndex={locked ? -1 : 0}
                draggable={!locked}
                onDragStart={(e) => {
                  setDragFrom(i);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData(PHOTO_DRAG_TYPE, String(i));
                }}
                onDragOver={(e) => {
                  if (dragFrom === null) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragFrom !== null) handlers.movePhoto(dragFrom, i);
                  setDragFrom(null);
                }}
                onDragEnd={() => setDragFrom(null)}
                onKeyDown={(e) => {
                  // Drag-and-drop alone would make the cover unreachable without
                  // a mouse. Arrow keys do the same job from the keyboard.
                  if (locked) return;
                  if (e.key === "ArrowLeft" && i > 0) {
                    e.preventDefault();
                    handlers.movePhoto(i, i - 1);
                  } else if (e.key === "ArrowRight" && i < card.photos.length - 1) {
                    e.preventDefault();
                    handlers.movePhoto(i, i + 1);
                  }
                }}
                aria-label={`Photo ${i + 1} of ${card.photos.length}${i === 0 ? " (cover)" : ""}${
                  photo.status === "uploading"
                    ? ", processing"
                    : photo.status === "failed"
                      ? ", failed"
                      : ". Use the left and right arrow keys to reorder."
                }`}
                className={cn(
                  "relative size-[70px] shrink-0 overflow-hidden rounded-lg border-[1.5px] bg-[radial-gradient(120%_120%_at_30%_25%,var(--sz-surface-raised),var(--sz-accent-soft))]",
                  photo.status === "failed" ? "border-error" : "border-line",
                  !locked && "cursor-grab",
                  dragFrom === i && "opacity-50",
                )}
              >
                <Image
                  src={photo.url}
                  alt=""
                  width={70}
                  height={70}
                  unoptimized
                  loading="eager"
                  draggable={false}
                  className={cn("size-full object-cover", photo.status !== "ready" && "opacity-60")}
                />

                {photo.status === "uploading" && (
                  <span className="absolute inset-0 flex items-center justify-center bg-canvas/55">
                    <span className="size-5 animate-spin rounded-pill border-2 border-line border-t-primary-700" />
                  </span>
                )}

                {photo.status === "failed" && (
                  <span className="absolute inset-x-0 bottom-0 bg-error-soft/95 py-0.5 text-center font-mono text-[7.5px] font-semibold text-error">
                    FAILED
                  </span>
                )}

                {i === 0 && photo.status === "ready" && (
                  <span className="absolute left-[3px] top-[3px] rounded bg-primary-700 px-1 py-0.5 font-mono text-[7.5px] font-semibold tracking-[.1em] text-white">
                    COVER
                  </span>
                )}

                {!locked && (
                  <button
                    type="button"
                    onClick={() => handlers.removePhoto(i)}
                    aria-label={`Remove photo ${i + 1}`}
                    title="Remove photo"
                    className="absolute bottom-[3px] right-[3px] inline-flex size-[21px] items-center justify-center rounded-[5px] bg-canvas/95 text-error"
                  >
                    <Icon name="trash" size={13} />
                  </button>
                )}
              </div>
            ))}

            {!locked && !photosFull && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={!hasSku}
                aria-label={`Add photo to ${label}`}
                title={hasSku ? "Add photos" : "Enter the SKU first — it gets stamped onto the photo"}
                className="flex size-[70px] shrink-0 flex-col items-center justify-center gap-[3px] rounded-lg border-[1.5px] border-dashed border-line bg-canvas text-primary-700 hover:border-primary-700 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-[var(--sz-disabled-opacity)] disabled:hover:border-line disabled:hover:bg-canvas"
              >
                <Icon name="plus" size={17} />
                <span className="text-[9.5px] font-semibold">Add</span>
              </button>
            )}

            {/* `image/*` alone is not enough: several file pickers (Windows,
                some Android builds) map it from the OS type registry and hide
                .heic/.heif entirely — the format an iPhone produces by default.
                Naming the extensions as well makes them selectable. The server
                decides what it can actually read; this only decides what the
                dialog is willing to show. */}
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.heic,.heif,.avif,.jpg,.jpeg,.png,.webp,.gif,.tif,.tiff,.bmp"
              multiple
              hidden
              onChange={(e) => {
                handlers.addPhotos(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {/* Why the Add button is dead, said before it is clicked rather than
              after. The SKU is burned into the image, so there is nothing to
              upload until there is one. */}
          {!locked && !hasSku && (
            <p className="mt-1.5 text-[10.5px] text-muted">Enter the SKU first — it gets stamped onto every photo.</p>
          )}

          {card.photos.some((p) => p.status === "failed") && (
            <ul className="mt-1.5 flex flex-col gap-0.5">
              {card.photos.map((photo, i) =>
                photo.status === "failed" ? (
                  <li key={photo.id} role="alert" className="text-[10.5px] text-error">
                    Photo {i + 1}: {photo.error}
                  </li>
                ) : null,
              )}
            </ul>
          )}
        </div>

        {/* Name. The spec hides this when adding; here it stays, optional — a
            blank name is still derived from category and SKU on save (see
            editor-model.ts). Placeholders are off by owner preference; the
            floating label carries the field's meaning. */}
        <Fw label={mode === "add" ? "Product name" : "Product name *"} required={mode !== "add"} error={card.errors.name}>
          <input
            value={card.name}
            disabled={locked}
            onChange={(e) => handlers.edit({ name: e.target.value })}
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
                disabled={lockSku}
                readOnly={lockSku}
                onChange={(e) => handlers.onSkuChange(e.target.value)}
                aria-invalid={!!card.errors.sku}
                aria-describedby={lockSku && !locked ? lockNoteId : undefined}
                className={cn(
                  fieldClass,
                  "font-mono",
                  lockSku && "disabled:opacity-[var(--sz-disabled-opacity)]",
                  card.errors.sku && "border-error",
                )}
              />
            </Fw>
            {lockSku && !locked && (
              <p id={lockNoteId} className="mt-1 text-[10px] text-muted">
                Stamped onto the photos — remove them to change it.
              </p>
            )}
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
                onBlur={handlers.onPriceBlur}
                inputMode="decimal"
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
            disabled={locked}
            onChange={(v) => handlers.edit({ gross: v, origin: { ...card.origin, gross: "typed" } })}
          />
          <Weight
            label="Net g *"
            required
            value={card.net}
            disabled={locked}
            error={card.errors.netWeight}
            onChange={(v) => handlers.edit({ net: v, origin: { ...card.origin, net: "typed" } })}
          />
          <Weight
            label="Dia ct"
            value={card.diamond}
            disabled={locked}
            onChange={(v) => handlers.edit({ diamond: v, origin: { ...card.origin, diamond: "typed" } })}
          />
          <Weight
            label="Stn ct"
            value={card.stone}
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
  /** Value and label differ only for a value that has left the taxonomy, which
   *  says so in its label while still posting the string it stores. */
  options: VocabOption[];
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
          <option key={o.value} value={o.value}>
            {o.label}
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
  disabled,
  error,
  onChange,
}: {
  label: string;
  required?: boolean;
  value: string;
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
        aria-invalid={!!error}
        className={cn(fieldClass, "font-mono", error && "border-error")}
      />
    </Fw>
  );
}
