import "server-only";

import type { RowDataPacket, ResultSetHeader } from "mysql2";
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
