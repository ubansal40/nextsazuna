/**
 * Admin product projections — the parts with no database in them.
 *
 * Pure so the client table can import the row shape without dragging
 * `server-only` into the client bundle (the same split as
 * lib/customer-projection.ts). Money stays a string the whole way through —
 * never parsed to a float on the way to the screen (ADR 0003).
 */

import { operatorFailureMessage } from "./image-queue";

/** A row from the admin product list query (draft-visible — no IS_VISIBLE gate). */
export interface AdminProductRow {
  id: number;
  name: string;
  slug: string;
  sku: string;
  image_url: string | null;
  price: string;
  sale_price: string | null;
  effective_price: string;
  is_active: number;
  always_available: number;
  material: string | null;
  purity: string | null;
  category_names: string | null;
  tag_names: string | null;
  image_processing_status: string | null;
  image_processing_error: string | null;
}

/**
 * A product's lifecycle state, the way the admin thinks about it. There is no
 * stock counter — availability is `is_active`, and a piece is either live on the
 * storefront or held back as a draft — with one extra state the operator cares
 * about: an image still being processed, which is why a product may look empty.
 */
export type ProductStatus = "published" | "draft" | "processing" | "failed";

export interface AdminProductListItem {
  id: number;
  name: string;
  slug: string;
  sku: string;
  imageUrl: string | null;
  /** MRP. */
  price: string;
  /** Selling price, when it is a genuine markdown below MRP. */
  salePrice: string | null;
  /** What the customer actually pays — `sale_price ?? price`. */
  effectivePrice: string;
  hasSale: boolean;
  status: ProductStatus;
  alwaysAvailable: boolean;
  material: string | null;
  purity: string | null;
  categoryNames: string;
  /**
   * Why the photos failed, in a sentence, or null when they did not.
   *
   * A "Failed" chip with no reason is the worst of both worlds: it tells the
   * operator something is wrong and nothing about what, so the only move left is
   * to guess. The stored message already says whether the file was a HEIC or the
   * server ran out of room — carrying it to the screen is what makes the retry
   * button a decision rather than a coin flip.
   */
  imageError: string | null;
}

/**
 * The status shown in the list. A pending or in-flight image job outranks the
 * publish flag, because "why is this product blank?" is answered by "its photo
 * is still processing", not by "it is a draft" — even though the pipeline forced
 * it to draft to get there. A failed job is surfaced so it can be retried.
 */
function resolveStatus(row: AdminProductRow): ProductStatus {
  const job = row.image_processing_status;
  if (job === "pending" || job === "processing") return "processing";
  if (job === "failed") return "failed";
  return row.is_active === 1 ? "published" : "draft";
}

/** Whether the sale price is a real markdown — non-null, positive, below MRP.
 *  Matches the storefront's rule so the admin and the shop agree on "on sale". */
export function isGenuineSale(price: string, salePrice: string | null): boolean {
  if (salePrice == null) return false;
  const sale = Number(salePrice);
  const mrp = Number(price);
  return Number.isFinite(sale) && Number.isFinite(mrp) && sale > 0 && sale < mrp;
}

export function toAdminProductListItem(row: AdminProductRow): AdminProductListItem {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    sku: row.sku,
    imageUrl: row.image_url,
    price: row.price,
    salePrice: row.sale_price,
    effectivePrice: row.effective_price,
    hasSale: isGenuineSale(row.price, row.sale_price),
    status: resolveStatus(row),
    alwaysAvailable: row.always_available === 1,
    material: row.material,
    purity: row.purity,
    categoryNames: row.category_names ?? "",
    imageError:
      row.image_processing_status === "failed"
        ? operatorFailureMessage(row.image_processing_error)
        : null,
  };
}
