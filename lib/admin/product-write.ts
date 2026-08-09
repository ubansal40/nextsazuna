import "server-only";

import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { pool, transaction } from "../db";
import { recordAdminAction } from "./audit";
import { computeRulePrice, type PricingRuleCondition } from "./pricing";
import { MAX_PRODUCT_PHOTOS } from "./product-limits";
import type { AdminContext } from "./rbac";

/**
 * Product create and edit.
 *
 * Everything the reference validates, plus the guards it lacks and the pricing
 * model the owner chose. The base price is derived from the matching pricing
 * rule at save (the editor's field is the sale price).
 *
 * Photos arrive already processed — the upload route encodes each one before it
 * ever reaches this function, so there is no draft-until-the-images-are-ready
 * state and no job to enqueue. A saved product's images exist.
 */

export interface ProductInput {
  name: string;
  sku: string;
  material: string;
  purity: string;
  stoneType: string;
  description: string;
  /** The customer-facing selling price — the editor's one price field. */
  salePrice: string;
  grossWeight: string;
  netWeight: string;
  diamondWeight: string;
  stoneWeight: string;
  categoryIds: number[];
  tagIds: number[];
  /** Processed image URLs, in gallery order. The first is the cover. */
  imageUrls: string[];
  alwaysAvailable: boolean;
}

/** A field the editor rejected — carries which card field so the form can mark it. */
export class ProductValidationError extends Error {
  constructor(
    message: string,
    public field: string,
  ) {
    super(message);
    this.name = "ProductValidationError";
  }
}

function decimal(value: unknown, field: string, { required = false } = {}): string {
  const raw = String(value ?? "").trim();
  if (!raw) {
    if (required) throw new ProductValidationError("This is required.", field);
    return "";
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new ProductValidationError("Enter a valid number.", field);
  return n.toFixed(3);
}

/** Validate and normalise raw editor input, or throw a ProductValidationError. */
export function parseProductInput(raw: Partial<ProductInput>): ProductInput {
  const name = String(raw.name ?? "").trim();
  if (!name) throw new ProductValidationError("Product name is required.", "name");

  const sku = String(raw.sku ?? "").trim().toUpperCase();
  if (!sku) throw new ProductValidationError("SKU is required.", "sku");

  const saleRaw = String(raw.salePrice ?? "").trim();
  const sale = Number(saleRaw);
  if (!saleRaw || !Number.isFinite(sale)) throw new ProductValidationError("Sale price is required.", "salePrice");
  // The reference's one good guard, kept: zero would make EFFECTIVE_PRICE zero
  // and checkout free, since any non-null sale price wins.
  if (sale <= 0) throw new ProductValidationError("Sale price must be greater than zero.", "salePrice");

  const categoryIds = [...new Set((raw.categoryIds ?? []).filter((n) => Number.isInteger(n) && n > 0))];
  if (categoryIds.length === 0) throw new ProductValidationError("Choose at least one category.", "categories");

  // De-duplicated first: the same photo listed twice is one photo, and counting
  // it as two would refuse a save the operator has no way to understand.
  const imageUrls = [
    ...new Set((raw.imageUrls ?? []).filter((u): u is string => typeof u === "string" && u.length > 0)),
  ];
  if (imageUrls.length > MAX_PRODUCT_PHOTOS) {
    throw new ProductValidationError(`At most ${MAX_PRODUCT_PHOTOS} photos per product.`, "photos");
  }

  return {
    name: name.slice(0, 180),
    sku: sku.slice(0, 80),
    material: String(raw.material ?? "").trim().slice(0, 120),
    purity: String(raw.purity ?? "").trim().slice(0, 80),
    stoneType: String(raw.stoneType ?? "").trim().slice(0, 120),
    description: String(raw.description ?? "").trim(),
    salePrice: sale.toFixed(2),
    grossWeight: decimal(raw.grossWeight, "grossWeight"),
    netWeight: decimal(raw.netWeight, "netWeight", { required: true }),
    diamondWeight: decimal(raw.diamondWeight, "diamondWeight"),
    stoneWeight: decimal(raw.stoneWeight, "stoneWeight"),
    categoryIds,
    tagIds: [...new Set((raw.tagIds ?? []).filter((n) => Number.isInteger(n) && n > 0))],
    imageUrls,
    alwaysAvailable: raw.alwaysAvailable === true,
  };
}

function slugify(input: string): string {
  return (
    input.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 170) || "product"
  );
}

/** The raw rule row: bounds arrive as DECIMAL strings (or null). */
interface RuleRow extends RowDataPacket {
  material: string | null;
  purity: string | null;
  category_id: number | null;
  formula: string;
  gross_weight_min: string | null;
  gross_weight_max: string | null;
  net_weight_min: string | null;
  net_weight_max: string | null;
  diamond_weight_min: string | null;
  diamond_weight_max: string | null;
  stone_weight_min: string | null;
  stone_weight_max: string | null;
}

/** A DECIMAL-string bound pair as the matcher's numeric range, or null when
 *  both sides are unset (meaning "ignore this weight"). */
function range(min: string | null, max: string | null) {
  if (min == null && max == null) return null;
  return { min: min == null ? null : Number(min), max: max == null ? null : Number(max) };
}
interface SlugRow extends RowDataPacket {
  id: number;
}
interface CurrentRow extends RowDataPacket {
  slug: string;
  sku: string;
  price: string;
  is_active: number;
  /** How many photos the product has right now — governs the SKU lock. */
  photo_count: number;
}

/** Active rules in priority order, with their weight bands mapped for the
 *  matcher. One loader, so every caller sees the same rule set. */
async function loadPricingRules(): Promise<PricingRuleCondition[]> {
  const rows = await pool()
    .execute<RuleRow[]>(
      `SELECT material, purity, category_id, formula,
              gross_weight_min, gross_weight_max, net_weight_min, net_weight_max,
              diamond_weight_min, diamond_weight_max, stone_weight_min, stone_weight_max
         FROM pricing_rules WHERE is_active = 1 ORDER BY priority ASC, id ASC`,
    )
    .then(([result]) => result);

  // The weight ranges (migration 0014) are part of a rule's conditions, so they
  // have to reach the matcher here too — otherwise a band set in the pricing
  // screen would be ignored at the one moment it decides a price.
  const rules: PricingRuleCondition[] = rows.map((row) => ({
    material: row.material,
    purity: row.purity,
    category_id: row.category_id,
    formula: row.formula,
    gross_weight: range(row.gross_weight_min, row.gross_weight_max),
    net_weight: range(row.net_weight_min, row.net_weight_max),
    diamond_weight: range(row.diamond_weight_min, row.diamond_weight_max),
    stone_weight: range(row.stone_weight_min, row.stone_weight_max),
  }));
  return rules;
}

/**
 * The price the rules derive for a set of attributes and weights, or null when
 * nothing matches.
 *
 * Exported for the editor's live preview. It goes through the SAME rule load and
 * the SAME matcher as `resolveBasePrice`, so the number the admin is shown while
 * typing cannot disagree with the number the save computes — two implementations
 * of "what does this cost" is how a preview becomes a lie.
 */
export async function previewRulePrice(input: {
  material: string;
  purity: string;
  categoryIds: number[];
  grossWeight: string;
  netWeight: string;
  diamondWeight: string;
  stoneWeight: string;
}): Promise<string | null> {
  return computeRulePrice(await loadPricingRules(), {
    material: input.material || null,
    purity: input.purity || null,
    categoryIds: input.categoryIds,
    gross_weight: Number(input.grossWeight) || 0,
    net_weight: Number(input.netWeight) || 0,
    diamond_weight: Number(input.diamondWeight) || 0,
    stone_weight: Number(input.stoneWeight) || 0,
  });
}

/** The base (MRP) price for a product from the pricing rules, clamped so it is
 *  never below the selling price. Falls back to `fallback` when no rule matches. */
async function resolveBasePrice(input: ProductInput, fallback: string): Promise<string> {
  const rules = await loadPricingRules();

  const computed = computeRulePrice(rules, {
    material: input.material || null,
    purity: input.purity || null,
    categoryIds: input.categoryIds,
    gross_weight: Number(input.grossWeight) || 0,
    net_weight: Number(input.netWeight) || 0,
    diamond_weight: Number(input.diamondWeight) || 0,
    stone_weight: Number(input.stoneWeight) || 0,
  });

  const base = computed ?? fallback;
  // MRP must never sit below the selling price, or "on sale" would mean a markup.
  return Number(base) < Number(input.salePrice) ? input.salePrice : Number(base).toFixed(2);
}

async function uniqueSlug(conn: PoolConnection, base: string, excludeId: number | null): Promise<string> {
  for (let n = 0; n < 50; n += 1) {
    const candidate = n === 0 ? base : `${base}-${n + 1}`;
    const [rows] = await conn.execute<SlugRow[]>(
      "SELECT id FROM products WHERE slug = ? AND id <> ? LIMIT 1",
      [candidate, excludeId ?? 0],
    );
    if (rows.length === 0) return candidate;
  }
  return `${base}-${Date.now()}`;
}

/** Categories plus their parents, so a product in a child category also lists
 *  under its parent — the storefront browses by the whole tree. */
async function withAncestors(conn: PoolConnection, categoryIds: number[]): Promise<number[]> {
  if (categoryIds.length === 0) return [];
  const placeholders = categoryIds.map(() => "?").join(",");
  const [rows] = await conn.execute<(RowDataPacket & { parent_id: number | null })[]>(
    `SELECT parent_id FROM categories WHERE id IN (${placeholders}) AND parent_id IS NOT NULL`,
    categoryIds,
  );
  return [...new Set([...categoryIds, ...rows.map((r) => r.parent_id as number)])];
}

async function writeJoins(conn: PoolConnection, productId: number, input: ProductInput) {
  await conn.execute("DELETE FROM product_categories WHERE product_id = ?", [productId]);
  const categoryIds = await withAncestors(conn, input.categoryIds);
  for (const categoryId of categoryIds) {
    await conn.execute("INSERT INTO product_categories (product_id, category_id) VALUES (?, ?)", [productId, categoryId]);
  }
  await conn.execute("DELETE FROM product_tags WHERE product_id = ?", [productId]);
  for (const tagId of input.tagIds) {
    await conn.execute("INSERT INTO product_tags (product_id, tag_id) VALUES (?, ?)", [productId, tagId]);
  }
}

function autoDescription(input: ProductInput): string {
  if (input.description) return input.description;
  const bits = [input.purity, input.material].filter(Boolean).join(" ");
  return bits ? `${input.name} in ${bits}.` : `${input.name}.`;
}

export interface SaveResult {
  id: number;
}

/**
 * Create (no id) or update (id) a product, in one transaction with its audit
 * line.
 *
 * This function does NOT process images, and no longer needs to know that they
 * exist as anything other than URLs. Each photo was encoded by the upload route
 * as it was added, so by the time a save happens the files are on disk and the
 * product can be published immediately. The intermediate state this used to
 * have — saved, draft, photos pending, visibility to be restored later by a job
 * — is gone along with the queue that produced it.
 */
export async function saveProduct(
  admin: AdminContext,
  args: { id?: number; input: ProductInput },
): Promise<SaveResult> {
  const { id, input } = args;
  const imageUrls = input.imageUrls;

  // Current state for an update: keep the existing slug and, when no rule
  // matches, the existing price and visibility.
  let current: CurrentRow | null = null;
  if (id) {
    const [rows] = await pool().execute<CurrentRow[]>(
      `SELECT p.slug, p.sku, p.price, p.is_active,
              (SELECT COUNT(*) FROM product_images pi WHERE pi.product_id = p.id) AS photo_count
         FROM products p WHERE p.id = ? LIMIT 1`,
      [id],
    );
    current = rows[0] ?? null;
    if (!current) throw new ProductValidationError("Product not found.", "name");

    /**
     * The SKU lock.
     *
     * The SKU is burned into every photo of this product, so changing it while
     * photos exist puts a code on the image that disagrees with the record —
     * wrong data in a file nobody thinks to re-check, discovered eventually by
     * a customer. The originals are not kept (a 4 MB photo per shot on shared
     * hosting was not worth it), so there is nothing to re-stamp from either.
     *
     * The editor disables the field, which is where an operator actually meets
     * this rule. This is the boundary that makes it true.
     */
    if (Number(current.photo_count) > 0 && input.sku !== current.sku) {
      throw new ProductValidationError(
        "This product's photos are stamped with its SKU, so the SKU can't be changed. Remove the photos first.",
        "sku",
      );
    }
  }

  // Base (MRP) pricing. On CREATE the matching rule derives it from the piece's
  // metal weight (the owner's chosen auto-pricing); with no rule it falls back to
  // the sale price. On EDIT the existing MRP is KEPT — recomputing it on every
  // save would silently wipe a markdown an operator set by hand (a 50%-off piece
  // would snap back to full price). It is only ever raised so the sale price can
  // never sit above the MRP. A later "auto" control can recompute on request,
  // matching the mock's reset affordance.
  const price = id
    ? Number(current!.price) < Number(input.salePrice)
      ? input.salePrice
      : current!.price
    : await resolveBasePrice(input, input.salePrice);
  const description = autoDescription(input);
  // New products publish by default; an edit keeps whatever visibility it had.
  const activeNow = (id ? current!.is_active === 1 : true) ? 1 : 0;
  const primaryImage = imageUrls[0] ?? null;

  try {
    const savedId = await transaction(async (conn) => {
      let productId: number;

      if (id) {
        const slug = current!.slug;
        await conn.execute(
          `UPDATE products SET name=?, slug=?, sku=?, description=?, material=?, purity=?, stone_type=?,
                 gross_weight=?, net_weight=?, diamond_weight=?, stone_weight=?,
                 price=?, sale_price=?, always_available=?, is_active=?,
                 image_url=?
             WHERE id=?`,
          [
            input.name, slug, input.sku, description, input.material || null, input.purity || null,
            input.stoneType || null, input.grossWeight || null, input.netWeight || null,
            input.diamondWeight || null, input.stoneWeight || null, price, input.salePrice,
            input.alwaysAvailable ? 1 : 0, activeNow,
            primaryImage, id,
          ],
        );
        productId = id;
      } else {
        const slug = await uniqueSlug(conn, slugify(input.name), null);
        const [result] = await conn.execute(
          `INSERT INTO products
             (name, slug, sku, description, material, purity, stone_type,
              gross_weight, net_weight, diamond_weight, stone_weight,
              price, sale_price, stock, always_available, is_active, image_url)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 9999, ?, ?, ?)`,
          [
            input.name, slug, input.sku, description, input.material || null, input.purity || null,
            input.stoneType || null, input.grossWeight || null, input.netWeight || null,
            input.diamondWeight || null, input.stoneWeight || null, price, input.salePrice,
            input.alwaysAvailable ? 1 : 0, activeNow, primaryImage,
          ],
        );
        productId = (result as { insertId: number }).insertId;
      }

      await writeJoins(conn, productId, input);

      // Reconcile product_images with the submitted list. Rewritten wholesale
      // rather than diffed: the list carries its own order, and `sort_order`
      // IS the gallery order, so position 1 is the cover.
      await conn.execute("DELETE FROM product_images WHERE product_id = ?", [productId]);
      for (let i = 0; i < imageUrls.length; i += 1) {
        await conn.execute("INSERT INTO product_images (product_id, image_url, sort_order) VALUES (?, ?, ?)", [
          productId, imageUrls[i], i + 1,
        ]);
      }

      await recordAdminAction(conn, admin, {
        action: id ? "product.update" : "product.create",
        resourceType: "product",
        resourceId: productId,
        metadata: { sku: input.sku, name: input.name, images: imageUrls.length },
      });

      return productId;
    });

    return { id: savedId };
  } catch (error) {
    if (error instanceof ProductValidationError) throw error;
    const code = (error as { code?: string }).code;
    if (code === "ER_DUP_ENTRY") {
      throw new ProductValidationError("A product with this SKU already exists.", "sku");
    }
    throw error;
  }
}
