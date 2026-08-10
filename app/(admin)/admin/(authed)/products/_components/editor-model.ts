import type { AdminProductDetail } from "@/lib/admin/product-detail";
import type { SkuAutofill } from "../_editor-actions";

/**
 * The product-card model behind the shared editor in Sazuna Admin Products
 * .dc.html — one card per product, in all three of the spec's modes (create,
 * single edit, bulk).
 *
 * Kept out of the components so the rules that matter — what counts as filled,
 * what autofill is allowed to touch, what a card is named when nobody typed a
 * name — are readable in one place instead of scattered through JSX.
 */

/** The fields the inventory sheet can fill. */
export const AUTO_FIELDS = ["purity", "gross", "net", "diamond", "stone"] as const;
export type AutoField = (typeof AUTO_FIELDS)[number];

/**
 * Where a field's current value came from.
 *
 * This is the whole of the autofill-vs-typed rule: autofill writes into a field
 * that is `empty` or that autofill itself last wrote (`auto`), and NEVER into
 * one the admin has edited (`typed`). Correcting a mistyped SKU therefore
 * re-fills the weights it filled before, while a weight the admin measured by
 * hand survives every subsequent lookup. Overwriting a typed field is possible,
 * but only as the explicit "Use sheet values" action on the card.
 */
export type Origin = "empty" | "auto" | "typed";

/**
 * One photo tile.
 *
 * `url` is a local `blob:` preview while the file is being processed and the
 * served `/uploads/products/...` URL once it is done — so the tile shows the
 * operator's own photograph immediately and visibly becomes the stamped
 * catalogue image about two seconds later. `id` exists because the URL changes
 * underneath it and React needs an identity that does not.
 *
 * A `failed` photo keeps its tile on purpose. Dropping it and showing a toast
 * tells the operator that *something* failed among five files; keeping it says
 * which one, next to the picture, with the reason.
 */
export interface CardPhoto {
  id: string;
  url: string;
  status: "uploading" | "ready" | "failed";
  error: string | null;
}

let photoSeq = 0;
export function nextPhotoId(): string {
  photoSeq += 1;
  return `photo-${photoSeq}-${Math.random().toString(36).slice(2, 8)}`;
}

export function readyPhoto(url: string): CardPhoto {
  return { id: nextPhotoId(), url, status: "ready", error: null };
}

/** The URLs a save may write — never a blob: preview, never a failed upload. */
export function readyPhotoUrls(card: EditorCard): string[] {
  return card.photos.filter((p) => p.status === "ready").map((p) => p.url);
}

/** True while any photo is still being processed by the upload route. */
export function hasUploadingPhotos(card: EditorCard): boolean {
  return card.photos.some((p) => p.status === "uploading");
}

/**
 * Whether this card's SKU may still be edited.
 *
 * The SKU is stamped into every photo, and the originals are not kept, so a SKU
 * change with photos attached would leave the wrong code burned into the image
 * with no way to re-render it. Removing the photos is the way out, and it is the
 * honest one — the photographs genuinely do have to be redone.
 */
export function skuLocked(card: EditorCard): boolean {
  return card.photos.length > 0;
}

export type CardStatus = "editing" | "saving" | "saved" | "failed";

export interface EditorCard {
  /** Client-side identity. Not the product id — a new card has no id yet. */
  key: string;
  productId: number | null;
  name: string;
  sku: string;
  material: string;
  purity: string;
  salePrice: string;
  gross: string;
  net: string;
  diamond: string;
  stone: string;
  categoryIds: string[];
  tagIds: string[];
  photos: CardPhoto[];
  /**
   * Carried through untouched. The editor has no control for it (the spec's card
   * has none) but the save rewrites the column, so losing it here would silently
   * clear the stock-sync exemption on every edit. It is set from the products
   * list's bulk bar and from bulk edit.
   */
  alwaysAvailable: boolean;

  origin: Record<AutoField, Origin>;
  /** True once the admin has typed in the price — the spec's `saleOverride`. */
  saleOverride: boolean;
  /** The price the pricing rules last derived, or null when no rule matched. */
  rulePrice: string | null;
  /** The sheet row for the SKU currently in the field, when there is one. */
  sheetRow: SkuAutofill | null;
  /** True when the last lookup actually wrote something into this card. */
  sheetFilled: boolean;

  errors: Record<string, string>;
  status: CardStatus;
  savedId: number | null;
  failure: string | null;
}

let seq = 0;
function nextKey(): string {
  seq += 1;
  return `card-${seq}-${Math.random().toString(36).slice(2, 8)}`;
}

const CLEAN_ORIGIN: Record<AutoField, Origin> = {
  purity: "empty",
  gross: "empty",
  net: "empty",
  diamond: "empty",
  stone: "empty",
};

export function blankCard(): EditorCard {
  return {
    key: nextKey(),
    productId: null,
    name: "",
    sku: "",
    material: "",
    purity: "",
    salePrice: "",
    gross: "",
    net: "",
    diamond: "",
    stone: "",
    categoryIds: [],
    tagIds: [],
    photos: [],
    alwaysAvailable: false,
    origin: { ...CLEAN_ORIGIN },
    saleOverride: false,
    rulePrice: null,
    sheetRow: null,
    sheetFilled: false,
    errors: {},
    status: "editing",
    savedId: null,
    failure: null,
  };
}

/**
 * A card for an existing product. Every field it already holds counts as
 * `typed`: those values are the catalogue's, and an inventory sheet uploaded
 * months later must not quietly restate a weight somebody corrected by hand.
 */
export function cardFromProduct(product: AdminProductDetail): EditorCard {
  const origin = (value: string): Origin => (value ? "typed" : "empty");
  return {
    ...blankCard(),
    productId: product.id,
    name: product.name,
    sku: product.sku,
    material: product.material,
    purity: product.purity,
    salePrice: product.salePrice || product.price,
    gross: product.grossWeight,
    net: product.netWeight,
    diamond: product.diamondWeight,
    stone: product.stoneWeight,
    categoryIds: product.categoryIds.map(String),
    tagIds: product.tagIds.map(String),
    photos: product.imageUrls.map(readyPhoto),
    alwaysAvailable: product.alwaysAvailable,
    origin: {
      purity: origin(product.purity),
      gross: origin(product.grossWeight),
      net: origin(product.netWeight),
      diamond: origin(product.diamondWeight),
      stone: origin(product.stoneWeight),
    },
    saleOverride: true,
  };
}

/**
 * Duplicate a card — everything except the photos and the save state.
 *
 * Photos are deliberately not copied: the reference makes the same choice, and
 * for a good reason beyond blob-URL lifetimes — duplicate exists for the next
 * near-identical SKU, whose photographs are a different piece.
 */
export function duplicateCard(card: EditorCard): EditorCard {
  return {
    ...card,
    key: nextKey(),
    productId: null,
    sku: "",
    photos: [],
    // The SKU is what the sheet is keyed on, and it has been cleared.
    sheetRow: null,
    sheetFilled: false,
    origin: { ...card.origin, purity: card.purity ? "typed" : "empty" },
    errors: {},
    status: "editing",
    savedId: null,
    failure: null,
  };
}

/** True if the admin put anything at all into this card. Covers every editable
 *  field, so a half-filled card is never silently dropped on save. */
export function cardHasContent(card: EditorCard): boolean {
  return Boolean(
    card.name.trim() ||
      card.sku.trim() ||
      card.salePrice.trim() ||
      card.categoryIds.length ||
      card.tagIds.length ||
      card.photos.length ||
      card.material ||
      card.purity ||
      card.gross.trim() ||
      card.net.trim() ||
      card.diamond.trim() ||
      card.stone.trim(),
  );
}

/**
 * The name a card saves under.
 *
 * The spec hides the name field when adding, because nobody wants to invent
 * twenty product names in a row. The catalogue already has a house pattern for
 * these — "Diamond Women Ring - DLR10102" — so a blank name becomes
 * "<category> - <SKU>" rather than nothing. The field stays visible with this as
 * its placeholder: a derived name is fine, a silently invented one is not.
 */
export function derivedName(card: EditorCard, categoryLabel: (id: string) => string): string {
  const sku = card.sku.trim().toUpperCase();
  const category = card.categoryIds.length > 0 ? categoryLabel(card.categoryIds[0]) : "";
  if (category && sku) return `${category} - ${sku}`;
  return sku || category || "";
}

export function effectiveName(card: EditorCard, categoryLabel: (id: string) => string): string {
  return card.name.trim() || derivedName(card, categoryLabel);
}

/** The inputs a price preview depends on, as one comparable string. Used to drop
 *  a preview whose answer arrived after the admin changed the question. */
export function priceSignature(card: EditorCard): string {
  return [card.material, card.purity, card.categoryIds.join("."), card.gross, card.net, card.diamond, card.stone].join("|");
}

/** Nothing is priceable until at least one weight is present — the reference
 *  guards the same way, and a rule keyed on weight would otherwise match on
 *  zeroes. */
export function hasAnyWeight(card: EditorCard): boolean {
  return Boolean(card.gross.trim() || card.net.trim() || card.diamond.trim() || card.stone.trim());
}

/**
 * The slice of a card autofill owns: the fields the sheet can write, plus its
 * own bookkeeping.
 *
 * Deliberately NOT a whole card. Autofill is asynchronous — the lookup is
 * debounced and then awaited — so the card it reads is a snapshot, and a photo
 * upload can finish in the gap. Patching the live card with a whole snapshot
 * put that settled photo back to `uploading` behind a blob URL that had already
 * been revoked, and reverted `errors`, `status`, `savedId` and `failure` with
 * it. A narrow patch cannot reach any of that.
 */
export type AutofillPatch = Pick<EditorCard, AutoField | "origin" | "sheetRow" | "sheetFilled">;

/**
 * Apply a sheet row to a card.
 *
 * `force` is the explicit "Use sheet values" button; without it the row only
 * lands in fields that are empty or that a previous autofill wrote.
 */
export function applyAutofill(
  card: EditorCard,
  row: SkuAutofill,
  { force = false }: { force?: boolean } = {},
): { patch: AutofillPatch; filled: boolean } {
  const next: AutofillPatch = {
    purity: card.purity,
    gross: card.gross,
    net: card.net,
    diamond: card.diamond,
    stone: card.stone,
    origin: { ...card.origin },
    sheetRow: card.sheetRow,
    sheetFilled: card.sheetFilled,
  };
  let filled = false;

  const put = (field: AutoField, value: string) => {
    if (!value) return;
    if (!force && next.origin[field] === "typed") return;
    if (next[field] === value) {
      // Already agrees; still mark it as sheet-owned so a later correction
      // to the SKU can move it.
      next.origin[field] = "auto";
      return;
    }
    next[field] = value;
    next.origin[field] = "auto";
    filled = true;
  };

  put("purity", row.purity ?? "");
  put("gross", row.grossWeight);
  put("net", row.netWeight);
  put("diamond", row.diamondWeight);
  put("stone", row.stoneWeight);

  next.sheetRow = row;
  next.sheetFilled = filled || card.sheetFilled;
  return { patch: next, filled };
}

/** Cards that still need saving — an already-saved card is locked. */
export function pendingCards(cards: EditorCard[]): EditorCard[] {
  return cards.filter((c) => c.status !== "saved");
}
