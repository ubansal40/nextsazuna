import "server-only";

import type { RowDataPacket, ResultSetHeader } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { query, transaction } from "../db";
import { EFFECTIVE_PRICE } from "../catalog/sql";
import type { SqlParam } from "../db";
import { recordAdminAction } from "./audit";
import type { AdminContext } from "./rbac";
import {
  toAdminProductListItem,
  type AdminProductListItem,
  type AdminProductRow,
} from "./product-projection";

/**
 * Admin catalog reads and writes.
 *
 * Deliberately NOT `lib/catalog/*`, which is gated on `IS_VISIBLE` and so cannot
 * see a draft — the admin's whole job is the products the storefront is hiding.
 * The one shared piece is `EFFECTIVE_PRICE`, so "what does this cost" has one
 * definition across the shop and the console.
 */

/**
 * Escape the LIKE metacharacters in user input.
 *
 * The reference interpolates `%${q}%` and binds it, which is safe from SQL
 * injection but lets a customer's own `%` or `_` act as wildcards — a search for
 * "_" then matches every product. Escaping them (and the escape char itself)
 * makes the search mean what was typed. Used with `ESCAPE '\\'` below.
 */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

const SORTS: Record<string, string> = {
  id_desc: "p.id DESC",
  id_asc: "p.id ASC",
  name_asc: "p.name ASC, p.id DESC",
  name_desc: "p.name DESC, p.id DESC",
  sku_asc: "p.sku ASC",
  sku_desc: "p.sku DESC",
  price_asc: `${EFFECTIVE_PRICE} ASC, p.id DESC`,
  price_desc: `${EFFECTIVE_PRICE} DESC, p.id DESC`,
  status_asc: "p.is_active ASC, p.id DESC",
  status_desc: "p.is_active DESC, p.id DESC",
};

export interface AdminProductFilters {
  q?: string;
  category?: string;
  status?: "published" | "draft" | "";
  onSale?: boolean;
  material?: string;
  purity?: string;
  tag?: number;
  alwaysAvailable?: boolean | null;
  hasImage?: boolean;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminProductPage {
  items: AdminProductListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 40;

interface CountRow extends RowDataPacket {
  total: number;
}

/**
 * A page of products for the admin list. Sees drafts. Every filter is bound and
 * every search term escaped; the sort key is looked up in `SORTS`, never
 * interpolated.
 */
export async function listAdminProducts(filters: AdminProductFilters): Promise<AdminProductPage> {
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(filters.pageSize ?? DEFAULT_PAGE_SIZE)));
  const offset = (page - 1) * pageSize;

  const where: string[] = [];
  const params: SqlParam[] = [];

  const q = filters.q?.trim();
  if (q) {
    where.push("(p.name LIKE ? ESCAPE '\\\\' OR p.sku LIKE ? ESCAPE '\\\\')");
    const like = `%${escapeLike(q)}%`;
    params.push(like, like);
  }
  if (filters.category) {
    where.push(
      "p.id IN (SELECT pc.product_id FROM product_categories pc JOIN categories c ON c.id = pc.category_id WHERE c.slug = ?)",
    );
    params.push(filters.category);
  }
  if (filters.status === "published") {
    where.push("p.is_active = 1");
  } else if (filters.status === "draft") {
    where.push("p.is_active = 0");
  }
  if (filters.onSale) {
    where.push("p.sale_price IS NOT NULL AND p.sale_price > 0 AND p.sale_price < p.price");
  }
  if (filters.material) {
    where.push("p.material = ?");
    params.push(filters.material);
  }
  if (filters.purity) {
    where.push("p.purity = ?");
    params.push(filters.purity);
  }
  if (Number.isInteger(filters.tag) && (filters.tag as number) > 0) {
    where.push("p.id IN (SELECT pt.product_id FROM product_tags pt WHERE pt.tag_id = ?)");
    params.push(filters.tag as number);
  }
  if (filters.alwaysAvailable === true || filters.alwaysAvailable === false) {
    where.push("p.always_available = ?");
    params.push(filters.alwaysAvailable ? 1 : 0);
  }
  if (filters.hasImage) {
    where.push("p.image_url IS NOT NULL AND p.image_url <> ''");
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const orderBy = SORTS[filters.sort ?? "id_desc"] ?? SORTS.id_desc;

  const countRows = await query<CountRow>(
    `SELECT COUNT(DISTINCT p.id) AS total FROM products p ${whereClause}`,
    params,
  );
  const total = countRows[0]?.total ?? 0;

  const rows = await query<AdminProductRow & RowDataPacket>(
    `SELECT p.id, p.name, p.slug, p.sku, p.image_url, p.price, p.sale_price,
            ${EFFECTIVE_PRICE} AS effective_price,
            p.is_active, p.always_available, p.material, p.purity,
            GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ', ') AS category_names,
            GROUP_CONCAT(DISTINCT t.name ORDER BY t.name SEPARATOR ', ') AS tag_names,
            latest_job.status AS image_processing_status,
            latest_job.error_message AS image_processing_error
       FROM products p
       LEFT JOIN product_categories pc ON pc.product_id = p.id
       LEFT JOIN categories c ON c.id = pc.category_id
       LEFT JOIN product_tags pt ON pt.product_id = p.id
       LEFT JOIN tags t ON t.id = pt.tag_id
       LEFT JOIN (
         SELECT j.product_id, j.status, j.error_message
         FROM product_image_jobs j
         JOIN (SELECT product_id, MAX(id) AS latest FROM product_image_jobs GROUP BY product_id) g
           ON g.product_id = j.product_id AND g.latest = j.id
       ) latest_job ON latest_job.product_id = p.id
       ${whereClause}
       GROUP BY p.id
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );

  return {
    items: rows.map(toAdminProductListItem),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export interface FilterOption {
  value: string;
  label: string;
}

export interface AdminProductFilterOptions {
  categories: FilterOption[];
  tags: { value: number; label: string }[];
  materials: FilterOption[];
  purities: FilterOption[];
}

interface NameSlugRow extends RowDataPacket {
  slug: string;
  name: string;
}
interface IdNameRow extends RowDataPacket {
  id: number;
  name: string;
}
interface VocabRow extends RowDataPacket {
  value: string;
}

/**
 * The options that populate the list's filter drawer. Materials and purities
 * are read distinct from the catalogue for now — they become managed
 * vocabularies in the taxonomy phase, at which point this reads the tables.
 */
export async function getProductFilterOptions(): Promise<AdminProductFilterOptions> {
  const [categories, tags, materials, purities] = await Promise.all([
    query<NameSlugRow>("SELECT slug, name FROM categories ORDER BY name"),
    query<IdNameRow>("SELECT id, name FROM tags ORDER BY name"),
    query<VocabRow>(
      "SELECT DISTINCT material AS value FROM products WHERE material IS NOT NULL AND material <> '' ORDER BY material",
    ),
    query<VocabRow>(
      "SELECT DISTINCT purity AS value FROM products WHERE purity IS NOT NULL AND purity <> '' ORDER BY purity",
    ),
  ]);

  return {
    categories: categories.map((c) => ({ value: c.slug, label: c.name })),
    tags: tags.map((t) => ({ value: t.id, label: t.name })),
    materials: materials.map((m) => ({ value: m.value, label: m.value })),
    purities: purities.map((p) => ({ value: p.value, label: p.value })),
  };
}

/* --- writes ---------------------------------------------------------------- */

interface RefRow extends RowDataPacket {
  refs: number;
}

/**
 * Publish or unpublish products — availability is `is_active`, there is no stock
 * counter to move. Accepts one id or many so a row toggle and a bulk toggle
 * share the path. Runs in a transaction with its audit line, and returns how
 * many rows actually changed.
 */
export async function setProductsVisibility(
  admin: AdminContext,
  ids: number[],
  isActive: boolean,
): Promise<number> {
  const clean = [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0);
  if (clean.length === 0) return 0;

  return transaction(async (conn) => {
    const placeholders = clean.map(() => "?").join(",");
    const [result] = await conn.execute<ResultSetHeader>(
      `UPDATE products SET is_active = ? WHERE id IN (${placeholders})`,
      [isActive ? 1 : 0, ...clean],
    );
    await recordAdminAction(conn, admin, {
      action: isActive ? "product.publish" : "product.unpublish",
      resourceType: "product",
      resourceId: clean.length === 1 ? clean[0] : null,
      metadata: { ids: clean, changed: result.affectedRows },
    });
    return result.affectedRows;
  });
}

export type DeleteOutcome = { mode: "hard" } | { mode: "soft"; reason: "has_orders" };

/**
 * Delete a product — the reference's best pattern, kept.
 *
 * A product referenced by an order line is a seven-year record's counterpart and
 * is never hard-deleted; it is unpublished (`is_active = 0`) instead, so the
 * order still names a real product. Only a product with zero order history is
 * removed outright, its `product_images` rows cascading with it. (Image FILES on
 * disk are unlinked by the image pipeline; external URLs have nothing to clean.)
 */
export async function deleteProduct(admin: AdminContext, id: number): Promise<DeleteOutcome> {
  return transaction(async (conn) => {
    const [refRows] = await conn.execute<RefRow[]>(
      "SELECT COUNT(*) AS refs FROM order_items WHERE product_id = ?",
      [id],
    );
    const referenced = (refRows[0]?.refs ?? 0) > 0;

    if (referenced) {
      await conn.execute("UPDATE products SET is_active = 0 WHERE id = ?", [id]);
      await recordAdminAction(conn, admin, {
        action: "product.soft_delete",
        resourceType: "product",
        resourceId: id,
        metadata: { reason: "has_orders" },
      });
      return { mode: "soft", reason: "has_orders" };
    }

    await conn.execute("DELETE FROM products WHERE id = ?", [id]);
    await recordAdminAction(conn, admin, {
      action: "product.delete",
      resourceType: "product",
      resourceId: id,
    });
    return { mode: "hard" };
  });
}

export interface ProductEditorOptions {
  categories: { id: number; name: string }[];
  tags: { id: number; name: string }[];
  materials: string[];
  purities: string[];
}

/** The vocabularies the product editor's selects need — categories and tags by
 *  id (the write layer keys on id), materials and purities as the free strings
 *  the catalogue uses until they become managed vocabularies in the taxonomy
 *  phase. */
export async function getProductEditorOptions(): Promise<ProductEditorOptions> {
  const [categories, tags, materials, purities] = await Promise.all([
    query<IdNameRow>("SELECT id, name FROM categories ORDER BY name"),
    query<IdNameRow>("SELECT id, name FROM tags ORDER BY name"),
    query<VocabRow>("SELECT DISTINCT material AS value FROM products WHERE material IS NOT NULL AND material <> '' ORDER BY material"),
    query<VocabRow>("SELECT DISTINCT purity AS value FROM products WHERE purity IS NOT NULL AND purity <> '' ORDER BY purity"),
  ]);
  return {
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    tags: tags.map((t) => ({ id: t.id, name: t.name })),
    materials: materials.map((m) => m.value),
    purities: purities.map((p) => p.value),
  };
}

/**
 * Bulk-set `always_available` — the flag that exempts a product from the stock
 * sync drafting it when it is absent from an inventory export.
 *
 * This is the one field that decides whether a made-to-order piece survives a
 * sync, and no product in this catalogue carries it yet, so it needs to be
 * settable over a selection rather than one product at a time.
 */
export async function setProductsAlwaysAvailable(
  admin: AdminContext,
  ids: number[],
  alwaysAvailable: boolean,
): Promise<number> {
  const clean = [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0);
  if (clean.length === 0) return 0;

  return transaction(async (conn) => {
    const placeholders = clean.map(() => "?").join(",");
    const [result] = await conn.execute<ResultSetHeader>(
      `UPDATE products SET always_available = ? WHERE id IN (${placeholders})`,
      [alwaysAvailable ? 1 : 0, ...clean],
    );
    await recordAdminAction(conn, admin, {
      action: alwaysAvailable ? "product.always_available_on" : "product.always_available_off",
      resourceType: "product",
      resourceId: clean.length === 1 ? clean[0] : null,
      metadata: { ids: clean, changed: result.affectedRows },
    });
    return result.affectedRows;
  });
}

export interface BulkDeleteOutcome {
  /** Removed outright — nothing referenced them. */
  hardDeleted: number;
  /** Kept but unpublished, because order history references them. */
  softDeleted: number;
}

/**
 * Bulk delete, applying the same rule `deleteProduct` applies to one product: a
 * product with order history is NEVER removed, only unpublished, because
 * deleting it would tear a line item out of somebody's receipt.
 *
 * The two groups are decided in one query before anything is written, so a
 * concurrent order cannot land between the check and the delete for a product
 * already chosen for removal.
 */
export async function deleteProducts(admin: AdminContext, ids: number[]): Promise<BulkDeleteOutcome> {
  const clean = [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0);
  if (clean.length === 0) return { hardDeleted: 0, softDeleted: 0 };

  return transaction(async (conn) => {
    const placeholders = clean.map(() => "?").join(",");
    const [referenced] = await conn.execute<(RowDataPacket & { product_id: number })[]>(
      `SELECT DISTINCT product_id FROM order_items WHERE product_id IN (${placeholders})`,
      clean,
    );
    const keep = new Set(referenced.map((r) => r.product_id));
    const removable = clean.filter((id) => !keep.has(id));
    const soften = clean.filter((id) => keep.has(id));

    let hardDeleted = 0;
    if (removable.length > 0) {
      const [result] = await conn.execute<ResultSetHeader>(
        `DELETE FROM products WHERE id IN (${removable.map(() => "?").join(",")})`,
        removable,
      );
      hardDeleted = result.affectedRows;
    }
    let softDeleted = 0;
    if (soften.length > 0) {
      const [result] = await conn.execute<ResultSetHeader>(
        `UPDATE products SET is_active = 0 WHERE id IN (${soften.map(() => "?").join(",")})`,
        soften,
      );
      softDeleted = result.affectedRows;
    }

    await recordAdminAction(conn, admin, {
      action: "product.bulk_delete",
      resourceType: "product",
      metadata: { requested: clean.length, hardDeleted, softDeleted, keptForOrderHistory: soften },
    });
    return { hardDeleted, softDeleted };
  });
}

/* --- bulk edit ------------------------------------------------------------- */

export interface BulkProductSummary {
  id: number;
  name: string;
  sku: string;
  imageUrl: string | null;
  material: string;
  purity: string;
  alwaysAvailable: boolean;
}

interface BulkSummaryRow extends RowDataPacket {
  id: number;
  name: string;
  sku: string;
  image_url: string | null;
  material: string | null;
  purity: string | null;
  always_available: number;
}

/**
 * The products behind a bulk-edit selection, in the order they were selected.
 *
 * The bulk screen has to show what it is about to change — a list of ids is not
 * something anybody can check before pressing Apply.
 */
export async function listProductsByIds(ids: number[]): Promise<BulkProductSummary[]> {
  const clean = [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0);
  if (clean.length === 0) return [];

  const rows = await query<BulkSummaryRow>(
    `SELECT id, name, sku, image_url, material, purity, always_available
       FROM products WHERE id IN (${clean.map(() => "?").join(",")})`,
    clean,
  );
  const order = new Map(clean.map((id, index) => [id, index]));
  return rows
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((row) => ({
      id: row.id,
      name: row.name,
      sku: row.sku,
      imageUrl: row.image_url,
      material: row.material ?? "",
      purity: row.purity ?? "",
      alwaysAvailable: row.always_available === 1,
    }));
}

/** How a set-valued field (categories, tags) is applied over the selection. */
export type BulkSetMode = "add" | "remove" | "replace";

export interface BulkProductChanges {
  material?: string;
  purity?: string;
  categories?: { mode: BulkSetMode; ids: number[] };
  tags?: { mode: BulkSetMode; ids: number[] };
  alwaysAvailable?: boolean;
}

/** A bulk edit the caller must fix — carries a message meant for the admin. */
export class BulkEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BulkEditError";
  }
}

export interface BulkEditOutcome {
  /** How many products the selection resolved to. */
  products: number;
  /** Which fields were actually changed, for the screen's confirmation. */
  fields: string[];
}

/** One level of parents, exactly as the single-product save expands them, so a
 *  product filed under a child also lists under its parent. */
async function expandAncestors(conn: PoolConnection, categoryIds: number[]): Promise<number[]> {
  if (categoryIds.length === 0) return [];
  const [rows] = await conn.execute<(RowDataPacket & { parent_id: number | null })[]>(
    `SELECT parent_id FROM categories WHERE id IN (${categoryIds.map(() => "?").join(",")}) AND parent_id IS NOT NULL`,
    categoryIds,
  );
  return [...new Set([...categoryIds, ...rows.map((r) => r.parent_id as number)])];
}

/**
 * Apply one change across a selection of products.
 *
 * Only the fields that make sense over many products at once: material, purity,
 * categories, tags and the stock-sync exemption. Name, SKU, weights and price
 * are per-product by definition and are deliberately absent — a bulk price would
 * be the single most destructive control in this admin.
 *
 * A key that is absent is NOT touched: the screen sends only the fields the
 * admin ticked, so "leave it alone" and "set it to empty" can never be confused.
 * Everything runs in one transaction with its audit line, so a selection is
 * changed whole or not at all.
 */
export async function applyBulkProductEdit(
  admin: AdminContext,
  ids: number[],
  changes: BulkProductChanges,
): Promise<BulkEditOutcome> {
  const clean = [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0);
  if (clean.length === 0) throw new BulkEditError("No products were selected.");

  const ok = (set?: { mode: BulkSetMode; ids: number[] }) =>
    set ? { mode: set.mode, ids: [...new Set(set.ids)].filter((id) => Number.isInteger(id) && id > 0) } : undefined;
  const categories = ok(changes.categories);
  const tags = ok(changes.tags);

  if (categories && categories.ids.length === 0) {
    throw new BulkEditError("Choose at least one category, or untick the categories change.");
  }
  if (tags && tags.ids.length === 0) {
    throw new BulkEditError("Choose at least one tag, or untick the tags change.");
  }
  if (categories?.mode === "replace" && categories.ids.length === 0) {
    throw new BulkEditError("A product must sit in at least one category.");
  }

  const fields: string[] = [];
  if (changes.material !== undefined) fields.push("material");
  if (changes.purity !== undefined) fields.push("purity");
  if (changes.alwaysAvailable !== undefined) fields.push("always_available");
  if (categories) fields.push("categories");
  if (tags) fields.push("tags");
  if (fields.length === 0) throw new BulkEditError("Nothing was chosen to change.");

  return transaction(async (conn) => {
    const placeholders = clean.map(() => "?").join(",");

    // Column writes come from a whitelist, so no request body can name a column
    // this screen does not own.
    const sets: string[] = [];
    const params: SqlParam[] = [];
    if (changes.material !== undefined) {
      sets.push("material = ?");
      params.push(changes.material.trim().slice(0, 120) || null);
    }
    if (changes.purity !== undefined) {
      sets.push("purity = ?");
      params.push(changes.purity.trim().slice(0, 80) || null);
    }
    if (changes.alwaysAvailable !== undefined) {
      sets.push("always_available = ?");
      params.push(changes.alwaysAvailable ? 1 : 0);
    }
    if (sets.length > 0) {
      await conn.execute(`UPDATE products SET ${sets.join(", ")} WHERE id IN (${placeholders})`, [
        ...params,
        ...clean,
      ]);
    }

    if (categories) {
      const targets = categories.mode === "remove" ? categories.ids : await expandAncestors(conn, categories.ids);
      const targetPlaceholders = targets.map(() => "?").join(",");
      if (categories.mode === "replace") {
        await conn.execute(`DELETE FROM product_categories WHERE product_id IN (${placeholders})`, clean);
      } else if (categories.mode === "remove") {
        await conn.execute(
          `DELETE FROM product_categories WHERE product_id IN (${placeholders}) AND category_id IN (${targetPlaceholders})`,
          [...clean, ...targets],
        );
      }
      if (categories.mode !== "remove") {
        const values = clean.flatMap((productId) => targets.map((categoryId) => [productId, categoryId])).flat();
        const rowPlaceholders = clean.map(() => targets.map(() => "(?, ?)").join(",")).join(",");
        await conn.query(
          `INSERT IGNORE INTO product_categories (product_id, category_id) VALUES ${rowPlaceholders}`,
          values,
        );
      }

      // A product with no category is invisible to the storefront's browse and
      // is rejected by the product editor, so it must not be reachable from
      // here either. Checked inside the transaction: the rollback is the fix.
      const [orphans] = await conn.execute<(RowDataPacket & { n: number })[]>(
        `SELECT COUNT(*) AS n FROM products p
          WHERE p.id IN (${placeholders})
            AND NOT EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id)`,
        clean,
      );
      const stranded = orphans[0]?.n ?? 0;
      if (stranded > 0) {
        throw new BulkEditError(
          `That would leave ${stranded} product${stranded === 1 ? "" : "s"} in no category at all. Nothing was changed.`,
        );
      }
    }

    if (tags) {
      const tagPlaceholders = tags.ids.map(() => "?").join(",");
      if (tags.mode === "replace") {
        await conn.execute(`DELETE FROM product_tags WHERE product_id IN (${placeholders})`, clean);
      } else if (tags.mode === "remove") {
        await conn.execute(
          `DELETE FROM product_tags WHERE product_id IN (${placeholders}) AND tag_id IN (${tagPlaceholders})`,
          [...clean, ...tags.ids],
        );
      }
      if (tags.mode !== "remove") {
        const values = clean.flatMap((productId) => tags.ids.map((tagId) => [productId, tagId])).flat();
        const rowPlaceholders = clean.map(() => tags.ids.map(() => "(?, ?)").join(",")).join(",");
        await conn.query(`INSERT IGNORE INTO product_tags (product_id, tag_id) VALUES ${rowPlaceholders}`, values);
      }
    }

    await recordAdminAction(conn, admin, {
      action: "product.bulk_edit",
      resourceType: "product",
      metadata: { ids: clean, fields, changes: { ...changes, categories, tags } },
    });

    return { products: clean.length, fields };
  });
}
