import "server-only";

import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { pool, transaction } from "../db";
import { recordAdminAction } from "./audit";
import { computeRulePrice, type PricingRuleCondition } from "./pricing";
import { enqueueImageJob, runImageJob } from "./image-jobs";
import { isRawUrl } from "./images";
import type { AdminContext } from "./rbac";

/**
 * Product create and edit.
 *
 * Everything the reference validates, plus the guards it lacks and the pricing
 * model the owner chose. The base price is derived from the matching pricing
 * rule at save (the editor's field is the sale price); raw photos force the
 * product to draft until the image job restores its visibility.
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
  /** A mix of freshly-uploaded raw URLs and already-processed URLs. */
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
    imageUrls: (raw.imageUrls ?? []).filter((u): u is string => typeof u === "string" && u.length > 0),
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
  price: string;
  is_active: number;
}

/** The base (MRP) price for a product from the pricing rules, clamped so it is
 *  never below the selling price. Falls back to `fallback` when no rule matches. */
async function resolveBasePrice(input: ProductInput, fallback: string): Promise<string> {
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
  /** True when raw photos are being processed — the product is a draft until the
   *  job finishes and restores its intended visibility. */
  processing: boolean;
}

/**
 * Create (no id) or update (id) a product. Raw photos force the product to draft
 * and run through the image pipeline; a save with only already-processed images
 * keeps its intended visibility. Everything writes in one transaction with its
 * audit line; the image job then runs inline after the commit.
 */
export async function saveProduct(
  admin: AdminContext,
  args: { id?: number; input: ProductInput },
): Promise<SaveResult> {
  const { id, input } = args;
  const rawUrls = input.imageUrls.filter(isRawUrl);
  const existingUrls = input.imageUrls.filter((u) => !isRawUrl(u));

  // Current state for an update: keep the existing slug and, when no rule
  // matches, the existing price and visibility.
  let current: CurrentRow | null = null;
  if (id) {
    const [rows] = await pool().execute<CurrentRow[]>(
      "SELECT slug, price, is_active FROM products WHERE id = ? LIMIT 1",
      [id],
    );
    current = rows[0] ?? null;
    if (!current) throw new ProductValidationError("Product not found.", "name");
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
  // New products publish by default; an edit keeps its visibility. Raw photos
  // force draft either way, restored by the job.
  const desiredActive = id ? current!.is_active === 1 : true;
  const activeNow = rawUrls.length > 0 ? 0 : desiredActive ? 1 : 0;
  const primaryImage = rawUrls.length > 0 ? null : (existingUrls[0] ?? null);

  try {
    const savedId = await transaction(async (conn) => {
      let productId: number;

      if (id) {
        const slug = current!.slug;
        await conn.execute(
          `UPDATE products SET name=?, slug=?, sku=?, description=?, material=?, purity=?, stone_type=?,
                 gross_weight=?, net_weight=?, diamond_weight=?, stone_weight=?,
                 price=?, sale_price=?, always_available=?, is_active=?,
                 image_url=COALESCE(?, image_url)
             WHERE id=?`,
          [
            input.name, slug, input.sku, description, input.material || null, input.purity || null,
            input.stoneType || null, input.grossWeight || null, input.netWeight || null,
            input.diamondWeight || null, input.stoneWeight || null, price, input.salePrice,
            input.alwaysAvailable ? 1 : 0, activeNow,
            rawUrls.length > 0 ? null : primaryImage, id,
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

      if (rawUrls.length > 0) {
        await enqueueImageJob(conn, { productId, sku: input.sku, rawUrls, desiredActive });
      } else {
        // Reconcile product_images with the kept URLs.
        await conn.execute("DELETE FROM product_images WHERE product_id = ?", [productId]);
        for (let i = 0; i < existingUrls.length; i += 1) {
          await conn.execute("INSERT INTO product_images (product_id, image_url, sort_order) VALUES (?, ?, ?)", [
            productId, existingUrls[i], i + 1,
          ]);
        }
      }

      await recordAdminAction(conn, admin, {
        action: id ? "product.update" : "product.create",
        resourceType: "product",
        resourceId: productId,
        metadata: { sku: input.sku, name: input.name, raw_images: rawUrls.length },
      });

      return productId;
    });

    // Process the photos after the product + job are committed. It runs its own
    // transaction and restores the intended visibility on success.
    if (rawUrls.length > 0) {
      const [jobRows] = await pool().execute<(RowDataPacket & { id: number })[]>(
        "SELECT id FROM product_image_jobs WHERE product_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1",
        [savedId],
      );
      if (jobRows[0]) await runImageJob(jobRows[0].id);
    }

    return { id: savedId, processing: rawUrls.length > 0 };
  } catch (error) {
    if (error instanceof ProductValidationError) throw error;
    const code = (error as { code?: string }).code;
    if (code === "ER_DUP_ENTRY") {
      throw new ProductValidationError("A product with this SKU already exists.", "sku");
    }
    throw error;
  }
}
