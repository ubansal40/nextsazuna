import "server-only";

import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { query, queryOne, transaction } from "../db";
import { recordAdminAction } from "./audit";
import type { AdminContext } from "./rbac";

/**
 * Taxonomy — the managed vocabularies.
 *
 * Materials and purities are now rows, not content-block word-lists. A product's
 * membership is still the `material` / `purity` STRING on the product, so the
 * vocabulary and the catalogue are kept in step deliberately: renaming a
 * vocabulary entry rewrites the matching products' strings in the same
 * transaction, or the rename would silently orphan every product that used the
 * old name. The product count is computed live from that string match.
 */

export type VocabKind = "material" | "purity";

interface VocabConfig {
  table: "materials" | "purities";
  column: "material" | "purity";
  section: string;
}

const CONFIG: Record<VocabKind, VocabConfig> = {
  material: { table: "materials", column: "material", section: "materials" },
  purity: { table: "purities", column: "purity", section: "purities" },
};

export function vocabSection(kind: VocabKind): string {
  return CONFIG[kind].section;
}

export interface VocabRow {
  id: number;
  name: string;
  slug: string;
  isVisible: boolean;
  productCount: number;
  sortOrder: number;
}

interface VocabDbRow extends RowDataPacket {
  id: number;
  name: string;
  slug: string;
  is_visible: number;
  sort_order: number;
  product_count: number;
}

export interface TaxonomyCounts {
  categories: number;
  collections: number;
  tags: number;
  materials: number;
  purities: number;
}

interface CountRow extends RowDataPacket {
  categories: number;
  collections: number;
  tags: number;
  materials: number;
  purities: number;
}

/** The tab counts for the taxonomy strip — one row of table sizes. */
export async function getTaxonomyCounts(): Promise<TaxonomyCounts> {
  const rows = await query<CountRow>(
    `SELECT
       (SELECT COUNT(*) FROM categories)  AS categories,
       (SELECT COUNT(*) FROM collections) AS collections,
       (SELECT COUNT(*) FROM tags)        AS tags,
       (SELECT COUNT(*) FROM materials)   AS materials,
       (SELECT COUNT(*) FROM purities)    AS purities`,
  );
  const r = rows[0];
  return {
    categories: Number(r?.categories ?? 0),
    collections: Number(r?.collections ?? 0),
    tags: Number(r?.tags ?? 0),
    materials: Number(r?.materials ?? 0),
    purities: Number(r?.purities ?? 0),
  };
}

function slugify(input: string): string {
  return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "item";
}

/** The vocabulary, each entry with its live product count, in stored order. */
export async function listVocab(kind: VocabKind): Promise<VocabRow[]> {
  const { table, column } = CONFIG[kind];
  const rows = await query<VocabDbRow>(
    `SELECT v.id, v.name, v.slug, v.is_visible, v.sort_order,
            (SELECT COUNT(*) FROM products p WHERE p.${column} = v.name) AS product_count
       FROM ${table} v
      ORDER BY v.sort_order, v.name`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    isVisible: r.is_visible === 1,
    productCount: Number(r.product_count),
    sortOrder: r.sort_order,
  }));
}

export async function createVocab(admin: AdminContext, kind: VocabKind, nameRaw: string): Promise<number> {
  const { table, section } = CONFIG[kind];
  const name = nameRaw.trim().slice(0, 120);
  if (!name) throw new Error("A name is required.");

  return transaction(async (conn) => {
    const [[maxRow]] = await conn.execute<(RowDataPacket & { next: number })[]>(
      `SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM ${table}`,
    );
    const [result] = await conn.execute<ResultSetHeader>(
      `INSERT INTO ${table} (name, slug, sort_order) VALUES (?, ?, ?)`,
      [name, `${slugify(name)}-${Date.now().toString(36).slice(-4)}`, maxRow.next],
    );
    await recordAdminAction(conn, admin, { action: `${section}.create`, resourceType: section, resourceId: result.insertId, metadata: { name } });
    return result.insertId;
  });
}

/**
 * Rename a vocabulary entry — and every product that used the old name, in the
 * same transaction, so the count and the catalogue stay in step.
 */
export async function renameVocab(admin: AdminContext, kind: VocabKind, id: number, nameRaw: string): Promise<void> {
  const { table, column, section } = CONFIG[kind];
  const name = nameRaw.trim().slice(0, 120);
  if (!name) throw new Error("A name is required.");

  await transaction(async (conn) => {
    const [[current]] = await conn.execute<(RowDataPacket & { name: string })[]>(
      `SELECT name FROM ${table} WHERE id = ? LIMIT 1`,
      [id],
    );
    if (!current) throw new Error("Not found.");
    if (current.name === name) return;
    await conn.execute(`UPDATE ${table} SET name = ? WHERE id = ?`, [name, id]);
    await conn.execute(`UPDATE products SET ${column} = ? WHERE ${column} = ?`, [name, current.name]);
    await recordAdminAction(conn, admin, {
      action: `${section}.rename`,
      resourceType: section,
      resourceId: id,
      metadata: { from: current.name, to: name },
    });
  });
}

export async function setVocabVisibility(admin: AdminContext, kind: VocabKind, id: number, visible: boolean): Promise<void> {
  const { table, section } = CONFIG[kind];
  await transaction(async (conn) => {
    await conn.execute(`UPDATE ${table} SET is_visible = ? WHERE id = ?`, [visible ? 1 : 0, id]);
    await recordAdminAction(conn, admin, { action: `${section}.visibility`, resourceType: section, resourceId: id, metadata: { visible } });
  });
}

/** Delete a vocabulary entry. Products keep their string value (it simply leaves
 *  the managed list); nothing cascades to the catalogue. */
export async function deleteVocab(admin: AdminContext, kind: VocabKind, id: number): Promise<void> {
  const { table, section } = CONFIG[kind];
  await transaction(async (conn) => {
    await conn.execute(`DELETE FROM ${table} WHERE id = ?`, [id]);
    await recordAdminAction(conn, admin, { action: `${section}.delete`, resourceType: section, resourceId: id });
  });
}

/** Persist a drag-reorder: the given ids become sort_order 1..n. */
export async function reorderVocab(admin: AdminContext, kind: VocabKind, orderedIds: number[]): Promise<void> {
  const { table, section } = CONFIG[kind];
  const ids = orderedIds.filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) return;
  await transaction(async (conn) => {
    for (let i = 0; i < ids.length; i += 1) {
      await conn.execute(`UPDATE ${table} SET sort_order = ? WHERE id = ?`, [i + 1, ids[i]]);
    }
    await recordAdminAction(conn, admin, { action: `${section}.reorder`, resourceType: section, metadata: { count: ids.length } });
  });
}

/* --- categories ------------------------------------------------------------ */

const UNCATEGORIZED_SLUG = "uncategorized";

export interface CategoryRow {
  id: number;
  name: string;
  slug: string;
  parentId: number | null;
  description: string;
  imageUrl: string | null;
  isVisible: boolean;
  sortOrder: number;
  productCount: number;
  childCount: number;
  isProtected: boolean;
}

interface CategoryDbRow extends RowDataPacket {
  id: number;
  name: string;
  slug: string;
  parent_id: number | null;
  description: string | null;
  image_url: string | null;
  is_visible: number;
  sort_order: number;
  product_count: number;
  child_count: number;
}

/** Every category with its parent, live product count and child count, in stored
 *  order (top-level first, then by sort_order). The UI assembles the tree. */
export async function listCategories(): Promise<CategoryRow[]> {
  const rows = await query<CategoryDbRow>(
    `SELECT c.id, c.name, c.slug, c.parent_id, c.description, c.image_url, c.is_visible, c.sort_order,
            (SELECT COUNT(DISTINCT pc.product_id) FROM product_categories pc WHERE pc.category_id = c.id) AS product_count,
            (SELECT COUNT(*) FROM categories k WHERE k.parent_id = c.id) AS child_count
       FROM categories c
      ORDER BY (c.parent_id IS NOT NULL), c.parent_id, c.sort_order, c.name`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    parentId: r.parent_id,
    description: r.description ?? "",
    imageUrl: r.image_url,
    isVisible: r.is_visible === 1,
    sortOrder: r.sort_order,
    productCount: Number(r.product_count),
    childCount: Number(r.child_count),
    isProtected: r.slug === UNCATEGORIZED_SLUG,
  }));
}

export interface CategoryInput {
  name: string;
  slug: string;
  parentId: number | null;
  description: string;
  imageUrl: string | null;
  isVisible: boolean;
}

async function uniqueCategorySlug(conn: import("mysql2/promise").PoolConnection, base: string, excludeId: number | null): Promise<string> {
  for (let n = 0; n < 50; n += 1) {
    const candidate = n === 0 ? base : `${base}-${n + 1}`;
    const [rows] = await conn.execute<(RowDataPacket & { id: number })[]>(
      "SELECT id FROM categories WHERE slug = ? AND id <> ? LIMIT 1",
      [candidate, excludeId ?? 0],
    );
    if (rows.length === 0) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** A parent must be a real, top-level category (the tree is two levels), and a
 *  category cannot be its own parent or a parent of its own parent. */
async function validateParent(
  conn: import("mysql2/promise").PoolConnection,
  parentId: number | null,
  selfId: number | null,
): Promise<void> {
  if (parentId == null) return;
  if (parentId === selfId) throw new Error("A category cannot be its own parent.");
  const [rows] = await conn.execute<(RowDataPacket & { parent_id: number | null })[]>(
    "SELECT parent_id FROM categories WHERE id = ? LIMIT 1",
    [parentId],
  );
  if (rows.length === 0) throw new Error("That parent category does not exist.");
  if (rows[0].parent_id != null) throw new Error("Categories nest only two levels deep.");
  // Would this give the category a child while also giving it a parent?
  if (selfId != null) {
    const [kids] = await conn.execute<(RowDataPacket & { n: number })[]>(
      "SELECT COUNT(*) AS n FROM categories WHERE parent_id = ?",
      [selfId],
    );
    if (kids[0].n > 0) throw new Error("A category with sub-categories can't become a sub-category itself.");
  }
}

export async function createCategory(admin: AdminContext, input: CategoryInput): Promise<number> {
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new Error("A name is required.");
  return transaction(async (conn) => {
    await validateParent(conn, input.parentId, null);
    const slug = await uniqueCategorySlug(conn, slugify(input.slug || name), null);
    const [[maxRow]] = await conn.execute<(RowDataPacket & { next: number })[]>(
      "SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM categories WHERE (parent_id <=> ?)",
      [input.parentId],
    );
    const [result] = await conn.execute<ResultSetHeader>(
      `INSERT INTO categories (name, slug, description, image_url, parent_id, sort_order, is_visible)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, slug, input.description.trim() || null, input.imageUrl || null, input.parentId, maxRow.next, input.isVisible ? 1 : 0],
    );
    await recordAdminAction(conn, admin, { action: "categories.create", resourceType: "categories", resourceId: result.insertId, metadata: { name } });
    return result.insertId;
  });
}

export async function updateCategory(admin: AdminContext, id: number, input: CategoryInput): Promise<void> {
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new Error("A name is required.");
  await transaction(async (conn) => {
    const [[current]] = await conn.execute<(RowDataPacket & { slug: string })[]>("SELECT slug FROM categories WHERE id = ? LIMIT 1", [id]);
    if (!current) throw new Error("Not found.");
    const isProtected = current.slug === UNCATEGORIZED_SLUG;
    if (isProtected && (input.parentId != null)) throw new Error("Uncategorized stays a top-level category.");
    await validateParent(conn, input.parentId, id);
    // Keep the protected slug; otherwise regenerate from the given/derived slug.
    const slug = isProtected ? current.slug : await uniqueCategorySlug(conn, slugify(input.slug || name), id);
    await conn.execute(
      `UPDATE categories SET name = ?, slug = ?, description = ?, image_url = ?, parent_id = ?, is_visible = ? WHERE id = ?`,
      [name, slug, input.description.trim() || null, input.imageUrl || null, input.parentId, input.isVisible ? 1 : 0, id],
    );
    await recordAdminAction(conn, admin, { action: "categories.update", resourceType: "categories", resourceId: id, metadata: { name } });
  });
}

/**
 * Delete a category, reassigning its products to Uncategorized so no product is
 * left with none. Uncategorized itself can't be deleted; a parent's children are
 * lifted to top-level (the FK sets their parent_id null).
 */
export async function deleteCategory(admin: AdminContext, id: number): Promise<void> {
  await transaction(async (conn) => {
    const [[cat]] = await conn.execute<(RowDataPacket & { slug: string })[]>("SELECT slug FROM categories WHERE id = ? LIMIT 1", [id]);
    if (!cat) throw new Error("Not found.");
    if (cat.slug === UNCATEGORIZED_SLUG) throw new Error("Uncategorized can't be deleted.");

    const [[uncat]] = await conn.execute<(RowDataPacket & { id: number })[]>("SELECT id FROM categories WHERE slug = ? LIMIT 1", [UNCATEGORIZED_SLUG]);
    if (uncat) {
      // Move products to Uncategorized, skipping any already there (avoid a PK clash).
      await conn.execute(
        `UPDATE IGNORE product_categories SET category_id = ? WHERE category_id = ?`,
        [uncat.id, id],
      );
      await conn.execute("DELETE FROM product_categories WHERE category_id = ?", [id]);
    }
    await conn.execute("DELETE FROM categories WHERE id = ?", [id]);
    await recordAdminAction(conn, admin, { action: "categories.delete", resourceType: "categories", resourceId: id });
  });
}

export async function setCategoryVisibility(admin: AdminContext, id: number, visible: boolean): Promise<void> {
  await transaction(async (conn) => {
    await conn.execute("UPDATE categories SET is_visible = ? WHERE id = ?", [visible ? 1 : 0, id]);
    await recordAdminAction(conn, admin, { action: "categories.visibility", resourceType: "categories", resourceId: id, metadata: { visible } });
  });
}

/** Reorder siblings — the ids are all children of one parent (or all top-level),
 *  becoming sort_order 1..n in that group. */
export async function reorderCategories(admin: AdminContext, orderedIds: number[]): Promise<void> {
  const ids = orderedIds.filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) return;
  await transaction(async (conn) => {
    for (let i = 0; i < ids.length; i += 1) {
      await conn.execute("UPDATE categories SET sort_order = ? WHERE id = ?", [i + 1, ids[i]]);
    }
    await recordAdminAction(conn, admin, { action: "categories.reorder", resourceType: "categories", metadata: { count: ids.length } });
  });
}

/* --- collections ----------------------------------------------------------- */

/** A collection's rule-based membership as a bound WHERE fragment. Params, in
 *  order: collectionId, collectionId (the two EXISTS subqueries). */
const COLLECTION_MATCH = `
  p.is_active = 1
  AND (
    EXISTS (SELECT 1 FROM product_categories pc JOIN collection_categories cc ON cc.category_id = pc.category_id
             WHERE pc.product_id = p.id AND cc.collection_id = ?)
    OR EXISTS (SELECT 1 FROM product_tags pt JOIN collection_tags ct ON ct.tag_id = pt.tag_id
                WHERE pt.product_id = p.id AND ct.collection_id = ?)
  )`;

export interface CollectionRow {
  id: number;
  name: string;
  slug: string;
  isVisible: boolean;
  sortOrder: number;
  categoryCount: number;
  tagCount: number;
  priceBandMin: string | null;
  priceBandMax: string | null;
  productCount: number;
}

interface CollectionDbRow extends RowDataPacket {
  id: number;
  name: string;
  slug: string;
  is_active: number;
  sort_order: number;
  price_band_min: string | null;
  price_band_max: string | null;
  category_count: number;
  tag_count: number;
  product_count: number;
}

/** Collections with their rule counts and the live count of products the rules
 *  match (price band applied to the effective price), in stored order. */
export async function listCollections(): Promise<CollectionRow[]> {
  const rows = await query<CollectionDbRow>(
    `SELECT col.id, col.name, col.slug, col.is_active, col.sort_order,
            col.price_band_min, col.price_band_max,
            (SELECT COUNT(*) FROM collection_categories WHERE collection_id = col.id) AS category_count,
            (SELECT COUNT(*) FROM collection_tags WHERE collection_id = col.id)       AS tag_count,
            (SELECT COUNT(DISTINCT p.id) FROM products p
               WHERE ${COLLECTION_MATCH.replace(/\?/g, "col.id")}
                 AND (col.price_band_min IS NULL OR (CASE WHEN p.sale_price IS NOT NULL THEN p.sale_price ELSE p.price END) >= col.price_band_min)
                 AND (col.price_band_max IS NULL OR (CASE WHEN p.sale_price IS NOT NULL THEN p.sale_price ELSE p.price END) <= col.price_band_max)
            ) AS product_count
       FROM collections col
      ORDER BY col.sort_order, col.name`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    isVisible: r.is_active === 1,
    sortOrder: r.sort_order,
    categoryCount: Number(r.category_count),
    tagCount: Number(r.tag_count),
    priceBandMin: r.price_band_min,
    priceBandMax: r.price_band_max,
    productCount: Number(r.product_count),
  }));
}

export interface CollectionDetail {
  id: number;
  name: string;
  slug: string;
  description: string;
  isVisible: boolean;
  categoryIds: number[];
  tagIds: number[];
  priceBandMin: string;
  priceBandMax: string;
}

export async function getCollection(id: number): Promise<CollectionDetail | null> {
  const row = await queryOne<RowDataPacket & { name: string; slug: string; description: string | null; is_active: number; price_band_min: string | null; price_band_max: string | null }>(
    "SELECT name, slug, description, is_active, price_band_min, price_band_max FROM collections WHERE id = ? LIMIT 1",
    [id],
  );
  if (!row) return null;
  const [cats, tags] = await Promise.all([
    query<RowDataPacket & { category_id: number }>("SELECT category_id FROM collection_categories WHERE collection_id = ?", [id]),
    query<RowDataPacket & { tag_id: number }>("SELECT tag_id FROM collection_tags WHERE collection_id = ?", [id]),
  ]);
  return {
    id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? "",
    isVisible: row.is_active === 1,
    categoryIds: cats.map((c) => c.category_id),
    tagIds: tags.map((t) => t.tag_id),
    priceBandMin: row.price_band_min ?? "",
    priceBandMax: row.price_band_max ?? "",
  };
}

export interface CollectionInput {
  name: string;
  slug: string;
  description: string;
  isVisible: boolean;
  categoryIds: number[];
  tagIds: number[];
  priceBandMin: string;
  priceBandMax: string;
}

function priceBand(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n.toFixed(2) : null;
}

async function writeCollectionRules(conn: import("mysql2/promise").PoolConnection, collectionId: number, input: CollectionInput) {
  await conn.execute("DELETE FROM collection_categories WHERE collection_id = ?", [collectionId]);
  for (const id of [...new Set(input.categoryIds)]) {
    await conn.execute("INSERT INTO collection_categories (collection_id, category_id) VALUES (?, ?)", [collectionId, id]);
  }
  await conn.execute("DELETE FROM collection_tags WHERE collection_id = ?", [collectionId]);
  for (const id of [...new Set(input.tagIds)]) {
    await conn.execute("INSERT INTO collection_tags (collection_id, tag_id) VALUES (?, ?)", [collectionId, id]);
  }
}

async function uniqueCollectionSlug(conn: import("mysql2/promise").PoolConnection, base: string, excludeId: number | null): Promise<string> {
  for (let n = 0; n < 50; n += 1) {
    const candidate = n === 0 ? base : `${base}-${n + 1}`;
    const [rows] = await conn.execute<(RowDataPacket & { id: number })[]>(
      "SELECT id FROM collections WHERE slug = ? AND id <> ? LIMIT 1",
      [candidate, excludeId ?? 0],
    );
    if (rows.length === 0) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function saveCollection(admin: AdminContext, id: number | null, input: CollectionInput): Promise<number> {
  const name = input.name.trim().slice(0, 150);
  if (!name) throw new Error("A name is required.");
  const min = priceBand(input.priceBandMin);
  const max = priceBand(input.priceBandMax);
  if (min != null && max != null && Number(min) > Number(max)) throw new Error("The price band's minimum is above its maximum.");

  return transaction(async (conn) => {
    let collectionId: number;
    if (id) {
      const slug = await uniqueCollectionSlug(conn, slugify(input.slug || name), id);
      await conn.execute(
        `UPDATE collections SET name = ?, slug = ?, description = ?, is_active = ?, price_band_min = ?, price_band_max = ? WHERE id = ?`,
        [name, slug, input.description.trim() || null, input.isVisible ? 1 : 0, min, max, id],
      );
      collectionId = id;
    } else {
      const slug = await uniqueCollectionSlug(conn, slugify(input.slug || name), null);
      const [[maxRow]] = await conn.execute<(RowDataPacket & { next: number })[]>("SELECT COALESCE(MAX(sort_order),0)+1 AS next FROM collections");
      const [result] = await conn.execute<ResultSetHeader>(
        `INSERT INTO collections (name, slug, description, is_active, sort_order, price_band_min, price_band_max)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [name, slug, input.description.trim() || null, input.isVisible ? 1 : 0, maxRow.next, min, max],
      );
      collectionId = result.insertId;
    }
    await writeCollectionRules(conn, collectionId, input);
    await recordAdminAction(conn, admin, { action: id ? "collections.update" : "collections.create", resourceType: "collections", resourceId: collectionId, metadata: { name } });
    return collectionId;
  });
}

export async function deleteCollection(admin: AdminContext, id: number): Promise<void> {
  await transaction(async (conn) => {
    await conn.execute("DELETE FROM collections WHERE id = ?", [id]);
    await recordAdminAction(conn, admin, { action: "collections.delete", resourceType: "collections", resourceId: id });
  });
}

export async function setCollectionVisibility(admin: AdminContext, id: number, visible: boolean): Promise<void> {
  await transaction(async (conn) => {
    await conn.execute("UPDATE collections SET is_active = ? WHERE id = ?", [visible ? 1 : 0, id]);
    await recordAdminAction(conn, admin, { action: "collections.visibility", resourceType: "collections", resourceId: id, metadata: { visible } });
  });
}

export async function reorderCollections(admin: AdminContext, orderedIds: number[]): Promise<void> {
  const ids = orderedIds.filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) return;
  await transaction(async (conn) => {
    for (let i = 0; i < ids.length; i += 1) await conn.execute("UPDATE collections SET sort_order = ? WHERE id = ?", [i + 1, ids[i]]);
    await recordAdminAction(conn, admin, { action: "collections.reorder", resourceType: "collections", metadata: { count: ids.length } });
  });
}

/* --- tags & tag groups ----------------------------------------------------- */

export interface TagRow {
  id: number;
  name: string;
  slug: string;
  groupId: number | null;
  isVisible: boolean;
  productCount: number;
}

export interface TagGroupRow {
  id: number;
  name: string;
  isVisible: boolean;
  sortOrder: number;
}

export interface TagsData {
  groups: TagGroupRow[];
  tags: TagRow[];
}

/** Every tag with its group and live product count, plus the groups. The UI
 *  buckets the tags under their group (and an "Ungrouped" section). */
export async function listTags(): Promise<TagsData> {
  const [groupRows, tagRows] = await Promise.all([
    query<RowDataPacket & { id: number; name: string; is_visible: number; sort_order: number }>(
      "SELECT id, name, is_visible, sort_order FROM tag_groups ORDER BY sort_order, name",
    ),
    query<RowDataPacket & { id: number; name: string; slug: string; group_id: number | null; is_visible: number; product_count: number }>(
      `SELECT t.id, t.name, t.slug, t.group_id, t.is_visible,
              (SELECT COUNT(*) FROM product_tags pt WHERE pt.tag_id = t.id) AS product_count
         FROM tags t ORDER BY t.sort_order, t.name`,
    ),
  ]);
  return {
    groups: groupRows.map((g) => ({ id: g.id, name: g.name, isVisible: g.is_visible === 1, sortOrder: g.sort_order })),
    tags: tagRows.map((t) => ({ id: t.id, name: t.name, slug: t.slug, groupId: t.group_id, isVisible: t.is_visible === 1, productCount: Number(t.product_count) })),
  };
}

export async function createTag(admin: AdminContext, name: string, groupId: number | null): Promise<void> {
  const clean = name.trim().slice(0, 120);
  if (!clean) throw new Error("A name is required.");
  await transaction(async (conn) => {
    const [result] = await conn.execute<ResultSetHeader>(
      "INSERT INTO tags (name, slug, group_id) VALUES (?, ?, ?)",
      [clean, `${slugify(clean)}-${Date.now().toString(36).slice(-4)}`, groupId],
    );
    await recordAdminAction(conn, admin, { action: "tags.create", resourceType: "tags", resourceId: result.insertId, metadata: { name: clean, groupId } });
  });
}

export async function renameTag(admin: AdminContext, id: number, name: string): Promise<void> {
  const clean = name.trim().slice(0, 120);
  if (!clean) throw new Error("A name is required.");
  await transaction(async (conn) => {
    await conn.execute("UPDATE tags SET name = ? WHERE id = ?", [clean, id]);
    await recordAdminAction(conn, admin, { action: "tags.rename", resourceType: "tags", resourceId: id, metadata: { name: clean } });
  });
}

/** Delete a tag. Its `product_tags` rows cascade (FK), so products simply lose
 *  the tag — nothing else changes. */
export async function deleteTag(admin: AdminContext, id: number): Promise<void> {
  await transaction(async (conn) => {
    await conn.execute("DELETE FROM tags WHERE id = ?", [id]);
    await recordAdminAction(conn, admin, { action: "tags.delete", resourceType: "tags", resourceId: id });
  });
}

export async function setTagVisibility(admin: AdminContext, id: number, visible: boolean): Promise<void> {
  await transaction(async (conn) => {
    await conn.execute("UPDATE tags SET is_visible = ? WHERE id = ?", [visible ? 1 : 0, id]);
    await recordAdminAction(conn, admin, { action: "tags.visibility", resourceType: "tags", resourceId: id, metadata: { visible } });
  });
}

export async function assignTagGroup(admin: AdminContext, id: number, groupId: number | null): Promise<void> {
  await transaction(async (conn) => {
    await conn.execute("UPDATE tags SET group_id = ? WHERE id = ?", [groupId, id]);
    await recordAdminAction(conn, admin, { action: "tags.group", resourceType: "tags", resourceId: id, metadata: { groupId } });
  });
}

/**
 * Merge one tag into another: every product tagged with the source gains the
 * destination (INSERT IGNORE, so a product already carrying both does not clash),
 * the source's product links are removed, and the source tag is deleted — all in
 * one transaction. This is destructive and irreversible, so the caller confirms
 * first and the audit records exactly what merged into what.
 */
export async function mergeTag(admin: AdminContext, sourceId: number, destId: number): Promise<void> {
  if (sourceId === destId) throw new Error("Choose a different tag to merge into.");
  await transaction(async (conn) => {
    await conn.execute(
      "INSERT IGNORE INTO product_tags (product_id, tag_id) SELECT product_id, ? FROM product_tags WHERE tag_id = ?",
      [destId, sourceId],
    );
    await conn.execute("DELETE FROM product_tags WHERE tag_id = ?", [sourceId]);
    await conn.execute("DELETE FROM tags WHERE id = ?", [sourceId]);
    await recordAdminAction(conn, admin, { action: "tags.merge", resourceType: "tags", resourceId: sourceId, metadata: { into: destId } });
  });
}

export async function createTagGroup(admin: AdminContext, name: string): Promise<void> {
  const clean = name.trim().slice(0, 120);
  if (!clean) throw new Error("A name is required.");
  await transaction(async (conn) => {
    const [[maxRow]] = await conn.execute<(RowDataPacket & { next: number })[]>("SELECT COALESCE(MAX(sort_order),0)+1 AS next FROM tag_groups");
    const [result] = await conn.execute<ResultSetHeader>("INSERT INTO tag_groups (name, sort_order) VALUES (?, ?)", [clean, maxRow.next]);
    await recordAdminAction(conn, admin, { action: "tag_groups.create", resourceType: "tag_groups", resourceId: result.insertId, metadata: { name: clean } });
  });
}

export async function renameTagGroup(admin: AdminContext, id: number, name: string): Promise<void> {
  const clean = name.trim().slice(0, 120);
  if (!clean) throw new Error("A name is required.");
  await transaction(async (conn) => {
    await conn.execute("UPDATE tag_groups SET name = ? WHERE id = ?", [clean, id]);
    await recordAdminAction(conn, admin, { action: "tag_groups.rename", resourceType: "tag_groups", resourceId: id, metadata: { name: clean } });
  });
}

export async function setTagGroupVisibility(admin: AdminContext, id: number, visible: boolean): Promise<void> {
  await transaction(async (conn) => {
    await conn.execute("UPDATE tag_groups SET is_visible = ? WHERE id = ?", [visible ? 1 : 0, id]);
    await recordAdminAction(conn, admin, { action: "tag_groups.visibility", resourceType: "tag_groups", resourceId: id, metadata: { visible } });
  });
}

/** Delete a group. Its tags' `group_id` is set null by the FK, so they become
 *  ungrouped rather than being deleted. */
export async function deleteTagGroup(admin: AdminContext, id: number): Promise<void> {
  await transaction(async (conn) => {
    await conn.execute("DELETE FROM tag_groups WHERE id = ?", [id]);
    await recordAdminAction(conn, admin, { action: "tag_groups.delete", resourceType: "tag_groups", resourceId: id });
  });
}
