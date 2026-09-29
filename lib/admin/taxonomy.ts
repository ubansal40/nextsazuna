import "server-only";

import type { RowDataPacket, ResultSetHeader } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { query, queryOne, transaction } from "../db";
import { recordAdminAction } from "./audit";
import { escapeLike } from "./catalog";
import type { AdminContext } from "./rbac";

/**
 * Taxonomy — the managed vocabularies.
 *
 * Materials and purities are now rows, not content-block word-lists. A product's
 * membership is still the `material` / `purity` STRING on the product, so the
 * vocabulary and the catalogue are kept in step deliberately: renaming a
 * vocabulary entry rewrites the matching products' (and pricing rules') strings
 * in the same transaction, or the rename would silently orphan every product
 * that used the old name. The product count is computed live from that string
 * match — which is also why two entries may not share a name.
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

/* --- slugs ------------------------------------------------------------------ */

/**
 * Categories, tags and collections share one URL space with products:
 * `/jewellery/{slug}.html` resolves a slug against categories, then tags, then
 * collections, then products, and the first match wins (lib/catalog/
 * resolve-slug.ts, ADR 0007). Each table's UNIQUE key sees only its own rows,
 * so a slug checked against its own table alone could still collide: a
 * category called "Wedding" silently took over the tag page at
 * /jewellery/wedding.html, and a collection named like a category could never
 * be reached at all. So every slug is checked against all four.
 */
type SlugTable = "categories" | "tags" | "collections";

interface SlugSelf {
  table: SlugTable;
  /** The row being saved, which may keep its own slug; null for a new one. */
  id: number | null;
}

/** What already answers `/jewellery/{slug}.html`, other than `self`. Every row
 *  counts, visible or not — a hidden collection or a draft product is one
 *  switch away from claiming the URL back. */
async function slugHolder(
  conn: PoolConnection,
  slug: string,
  self: SlugSelf,
): Promise<{ kind: string; name: string } | null> {
  const own = (table: SlugTable) => (self.table === table ? (self.id ?? 0) : 0);
  const [rows] = await conn.execute<(RowDataPacket & { kind: string; name: string })[]>(
    `SELECT 'category' AS kind, name FROM categories WHERE slug = ? AND id <> ?
     UNION ALL SELECT 'tag', name FROM tags WHERE slug = ? AND id <> ?
     UNION ALL SELECT 'collection', name FROM collections WHERE slug = ? AND id <> ?
     UNION ALL SELECT 'product', name FROM products WHERE slug = ?
     LIMIT 1`,
    [slug, own("categories"), slug, own("tags"), slug, own("collections"), slug],
  );
  return rows[0] ? { kind: rows[0].kind, name: rows[0].name } : null;
}

/** `base`, else `base-2`, `base-3`… — for a slug nobody typed, where a suffix
 *  is better than a refusal. */
async function freeSlug(conn: PoolConnection, base: string, self: SlugSelf): Promise<string> {
  for (let n = 0; n < 50; n += 1) {
    const candidate = n === 0 ? base : `${base}-${n + 1}`;
    if (!(await slugHolder(conn, candidate, self))) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * The slug a save should store.
 *
 *  - Left as it was: kept byte-for-byte. It is a live, possibly indexed URL, so
 *    an edit to anything else must never rewrite it — not even to normalise a
 *    legacy slug `slugify` would spell differently, or to step around a
 *    collision that predates this check.
 *  - Typed: the admin chose this URL, so a clash is refused with a sentence
 *    naming what holds it, rather than quietly suffixed into one they did not
 *    ask for.
 *  - Blank: generated from the name, and suffixed until free.
 */
async function chooseSlug(
  conn: PoolConnection,
  self: SlugSelf,
  typed: string,
  name: string,
  current: string | null,
): Promise<string> {
  const raw = typed.trim();
  if (current != null && raw === current) return current;
  if (!raw) return freeSlug(conn, slugify(name), self);
  const slug = slugify(raw);
  if (slug === current) return current;
  const holder = await slugHolder(conn, slug, self);
  if (holder) {
    throw new Error(
      `The slug “${slug}” is already the ${holder.kind} “${holder.name}” — /jewellery/${slug}.html can only show one page. Choose another slug, or leave it blank to generate one.`,
    );
  }
  return slug;
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

/**
 * Refuse a vocabulary name another entry already has.
 *
 * The name is the join key — a product's `material` column holds the name
 * itself — so two entries spelled alike would each count the same products,
 * and renaming one onto the other would merge their products irreversibly
 * (the rewrite below cannot tell them apart afterwards). Compared with the
 * column's own case-insensitive equality, because that is the equality the
 * product rewrite and the counts use: "gold" and "Gold" ARE the same entry.
 */
async function assertVocabNameFree(
  conn: PoolConnection,
  kind: VocabKind,
  name: string,
  selfId: number | null,
): Promise<void> {
  const [rows] = await conn.execute<(RowDataPacket & { name: string })[]>(
    `SELECT name FROM ${CONFIG[kind].table} WHERE name = ? AND id <> ? LIMIT 1`,
    [name, selfId ?? 0],
  );
  if (rows.length > 0) throw new Error(`“${rows[0].name}” is already a ${kind}. Choose another name.`);
}

export async function createVocab(admin: AdminContext, kind: VocabKind, nameRaw: string): Promise<number> {
  const { table, section } = CONFIG[kind];
  const name = nameRaw.trim().slice(0, 120);
  if (!name) throw new Error("A name is required.");

  return transaction(async (conn) => {
    await assertVocabNameFree(conn, kind, name, null);
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
 * Rename a vocabulary entry — and every product and pricing rule that used the
 * old name, in the same transaction, so the count, the catalogue and the
 * pricing stay in step.
 *
 * Pricing rules match on the same string (`findMatchingRule`), so a rename that
 * left them behind would quietly stop every rule written for the old name from
 * pricing anything at the next product save.
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
    await assertVocabNameFree(conn, kind, name, id);
    await conn.execute(`UPDATE ${table} SET name = ? WHERE id = ?`, [name, id]);
    const [products] = await conn.execute<ResultSetHeader>(
      `UPDATE products SET ${column} = ? WHERE ${column} = ?`,
      [name, current.name],
    );
    const [rules] = await conn.execute<ResultSetHeader>(
      `UPDATE pricing_rules SET ${column} = ? WHERE ${column} = ?`,
      [name, current.name],
    );
    await recordAdminAction(conn, admin, {
      action: `${section}.rename`,
      resourceType: section,
      resourceId: id,
      metadata: { from: current.name, to: name, products: products.affectedRows, pricingRules: rules.affectedRows },
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
    const slug = await chooseSlug(conn, { table: "categories", id: null }, input.slug, name, null);
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
    const [[current]] = await conn.execute<(RowDataPacket & { slug: string; parent_id: number | null })[]>(
      "SELECT slug, parent_id FROM categories WHERE id = ? LIMIT 1 FOR UPDATE",
      [id],
    );
    if (!current) throw new Error("Not found.");
    const isProtected = current.slug === UNCATEGORIZED_SLUG;
    if (isProtected && (input.parentId != null)) throw new Error("Uncategorized stays a top-level category.");
    await validateParent(conn, input.parentId, id);
    // The protected slug never moves; any other changes only when the slug field did.
    const slug = isProtected ? current.slug : await chooseSlug(conn, { table: "categories", id }, input.slug, name, current.slug);
    await conn.execute(
      `UPDATE categories SET name = ?, slug = ?, description = ?, image_url = ?, parent_id = ?, is_visible = ? WHERE id = ?`,
      [name, slug, input.description.trim() || null, input.imageUrl || null, input.parentId, input.isVisible ? 1 : 0, id],
    );
    if ((current.parent_id ?? null) !== (input.parentId ?? null)) {
      await moveParentLinks(conn, id, current.parent_id, input.parentId);
    }
    await recordAdminAction(conn, admin, { action: "categories.update", resourceType: "categories", resourceId: id, metadata: { name } });
  });
}

/**
 * Re-point the parent links a category's products carry after the category
 * moves in the tree.
 *
 * A product save stores its categories WITH their parents (`withAncestors` in
 * product-write.ts), so a product in Diamond Rings also has a Rings row — and
 * that row is what puts it in Rings' product count, a collection built on
 * Rings, a pricing rule for Rings. Moving Diamond Rings under Bridal used to
 * leave every one of its products in Rings and out of Bridal until each was
 * re-saved by hand.
 *
 * The old parent's link goes only where this category was its sole reason: a
 * product also filed under another child of the old parent keeps it. (A parent
 * chosen directly and a parent implied by a child are stored identically, so
 * another child is the only other reason the data can show.) The product is
 * never left in no category — it is still in this one.
 */
async function moveParentLinks(conn: PoolConnection, categoryId: number, from: number | null, to: number | null): Promise<void> {
  if (from != null) {
    const [stale] = await conn.execute<(RowDataPacket & { product_id: number })[]>(
      `SELECT pc.product_id FROM product_categories pc
        WHERE pc.category_id = ?
          AND EXISTS (SELECT 1 FROM product_categories up
                       WHERE up.product_id = pc.product_id AND up.category_id = ?)
          AND NOT EXISTS (SELECT 1 FROM product_categories sib JOIN categories k ON k.id = sib.category_id
                           WHERE sib.product_id = pc.product_id AND k.parent_id = ? AND k.id <> ?)`,
      [categoryId, from, from, categoryId],
    );
    if (stale.length > 0) {
      // Selected first and deleted by id: a DELETE whose subquery reads the table
      // it deletes from is refused by MySQL (error 1093).
      await conn.query(
        `DELETE FROM product_categories WHERE category_id = ? AND product_id IN (${stale.map(() => "?").join(",")})`,
        [from, ...stale.map((r) => r.product_id)],
      );
    }
  }
  if (to != null) {
    // `to` is a real category — validated above, and share-locked by the
    // parent_id foreign-key check the UPDATE just made — so IGNORE can only be
    // skipping products already linked to it, never swallowing an FK failure.
    await conn.execute(
      `INSERT IGNORE INTO product_categories (product_id, category_id)
       SELECT product_id, ? FROM product_categories WHERE category_id = ?`,
      [to, categoryId],
    );
  }
}

/**
 * Delete a category. A product filed nowhere else moves to Uncategorized so no
 * product is left with none; one also filed elsewhere simply loses this
 * category. Uncategorized itself can't be deleted; a parent's children are
 * lifted to top-level (the FK sets their parent_id null).
 *
 * Refused while a pricing rule names the category. `pricing_rules.category_id`
 * is ON DELETE SET NULL, and a rule with no category matches EVERY category —
 * so the delete would silently widen each such rule into a catch-all for its
 * material and purity: at once for an active rule, and on the day a switched-off
 * one is switched back on. What those rules should price instead is the
 * owner's decision, so the refusal names them.
 */
export async function deleteCategory(admin: AdminContext, id: number): Promise<void> {
  await transaction(async (conn) => {
    const [[cat]] = await conn.execute<(RowDataPacket & { slug: string; name: string })[]>(
      "SELECT slug, name FROM categories WHERE id = ? LIMIT 1 FOR UPDATE",
      [id],
    );
    if (!cat) throw new Error("Not found.");
    if (cat.slug === UNCATEGORIZED_SLUG) throw new Error("Uncategorized can't be deleted.");

    // The category row is locked above, and pointing a rule at it needs a shared
    // lock on that row for the foreign-key check — so no rule can start naming
    // it between this read and the delete.
    const [rules] = await conn.execute<(RowDataPacket & { name: string; is_active: number })[]>(
      "SELECT name, is_active FROM pricing_rules WHERE category_id = ? ORDER BY is_active DESC, priority, id",
      [id],
    );
    if (rules.length > 0) {
      const one = rules.length === 1;
      const shown = rules.slice(0, 5).map((r) => `“${r.name}”${r.is_active === 1 ? "" : " (switched off)"}`);
      const more = rules.length - shown.length;
      throw new Error(
        `“${cat.name}” is used by ${one ? "the pricing rule" : `${rules.length} pricing rules:`} ${shown.join(", ")}${more > 0 ? ` and ${more} more` : ""}. ` +
          `Deleting it would leave ${one ? "that rule" : "them"} pricing every category, so point ${one ? "it" : "them"} at another category ` +
          `or delete ${one ? "it" : "them"} under Pricing rules first.`,
      );
    }

    const [[uncat]] = await conn.execute<(RowDataPacket & { id: number })[]>("SELECT id FROM categories WHERE slug = ? LIMIT 1", [UNCATEGORIZED_SLUG]);
    if (uncat) {
      // Only products this was the last category of. Every link used to be
      // moved, so a ring in Rings and Daily Wear came out of a Daily Wear
      // delete in Rings AND Uncategorized.
      await conn.execute(
        `INSERT IGNORE INTO product_categories (product_id, category_id)
         SELECT pc.product_id, ? FROM product_categories pc
          WHERE pc.category_id = ?
            AND NOT EXISTS (SELECT 1 FROM product_categories other
                             WHERE other.product_id = pc.product_id AND other.category_id <> ?)`,
        [uncat.id, id, id],
      );
    }
    await conn.execute("DELETE FROM product_categories WHERE category_id = ?", [id]);
    await conn.execute("DELETE FROM categories WHERE id = ?", [id]);
    await recordAdminAction(conn, admin, { action: "categories.delete", resourceType: "categories", resourceId: id, metadata: { name: cat.name } });
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

/** A hand-picked product joins regardless of the rules or the price band — that
 *  is the point of picking it. Param: collectionId. */
const COLLECTION_MANUAL_MATCH = `
  p.is_active = 1
  AND EXISTS (SELECT 1 FROM collection_products cp
               WHERE cp.product_id = p.id AND cp.collection_id = ?)`;

export interface CollectionRow {
  id: number;
  name: string;
  slug: string;
  imageUrl: string | null;
  isVisible: boolean;
  sortOrder: number;
  categoryCount: number;
  tagCount: number;
  manualCount: number;
  priceBandMin: string | null;
  priceBandMax: string | null;
  productCount: number;
}

interface CollectionDbRow extends RowDataPacket {
  id: number;
  name: string;
  slug: string;
  image_url: string | null;
  is_active: number;
  sort_order: number;
  price_band_min: string | null;
  price_band_max: string | null;
  category_count: number;
  tag_count: number;
  manual_count: number;
  product_count: number;
}

/** Collections with their rule counts and the live count of products they hold,
 *  in stored order. That count is the union of the rule match (price band
 *  applied to the effective price) and the hand-picked products — the same
 *  membership the storefront will read — counted DISTINCT, so a product that is
 *  both matched and hand-picked is one product, not two. */
export async function listCollections(): Promise<CollectionRow[]> {
  const rows = await query<CollectionDbRow>(
    `SELECT col.id, col.name, col.slug, col.image_url, col.is_active, col.sort_order,
            col.price_band_min, col.price_band_max,
            (SELECT COUNT(*) FROM collection_categories WHERE collection_id = col.id) AS category_count,
            (SELECT COUNT(*) FROM collection_tags WHERE collection_id = col.id)       AS tag_count,
            (SELECT COUNT(*) FROM collection_products WHERE collection_id = col.id)   AS manual_count,
            (SELECT COUNT(DISTINCT p.id) FROM products p
               WHERE (
                 (${COLLECTION_MATCH.replace(/\?/g, "col.id")}
                    AND (col.price_band_min IS NULL OR (CASE WHEN p.sale_price IS NOT NULL THEN p.sale_price ELSE p.price END) >= col.price_band_min)
                    AND (col.price_band_max IS NULL OR (CASE WHEN p.sale_price IS NOT NULL THEN p.sale_price ELSE p.price END) <= col.price_band_max))
                 OR (${COLLECTION_MANUAL_MATCH.replace(/\?/g, "col.id")})
               )
            ) AS product_count
       FROM collections col
      ORDER BY col.sort_order, col.name`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    imageUrl: r.image_url,
    isVisible: r.is_active === 1,
    sortOrder: r.sort_order,
    categoryCount: Number(r.category_count),
    tagCount: Number(r.tag_count),
    manualCount: Number(r.manual_count),
    priceBandMin: r.price_band_min,
    priceBandMax: r.price_band_max,
    productCount: Number(r.product_count),
  }));
}

/** A hand-picked product as the drawer shows it: enough to render the row
 *  without a second round-trip, nothing more. */
export interface CollectionPick {
  id: number;
  name: string;
  sku: string;
  imageUrl: string | null;
}

export interface CollectionDetail {
  id: number;
  name: string;
  slug: string;
  description: string;
  imageUrl: string | null;
  isVisible: boolean;
  categoryIds: number[];
  tagIds: number[];
  priceBandMin: string;
  priceBandMax: string;
  manualProducts: CollectionPick[];
}

export async function getCollection(id: number): Promise<CollectionDetail | null> {
  const row = await queryOne<RowDataPacket & { name: string; slug: string; description: string | null; image_url: string | null; is_active: number; price_band_min: string | null; price_band_max: string | null }>(
    "SELECT name, slug, description, image_url, is_active, price_band_min, price_band_max FROM collections WHERE id = ? LIMIT 1",
    [id],
  );
  if (!row) return null;
  const [cats, tags, picks] = await Promise.all([
    query<RowDataPacket & { category_id: number }>("SELECT category_id FROM collection_categories WHERE collection_id = ?", [id]),
    query<RowDataPacket & { tag_id: number }>("SELECT tag_id FROM collection_tags WHERE collection_id = ?", [id]),
    query<RowDataPacket & { id: number; name: string; sku: string; image_url: string | null }>(
      `SELECT p.id, p.name, p.sku, p.image_url
         FROM collection_products cp JOIN products p ON p.id = cp.product_id
        WHERE cp.collection_id = ?
        ORDER BY cp.position, p.name`,
      [id],
    ),
  ]);
  return {
    id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? "",
    imageUrl: row.image_url,
    isVisible: row.is_active === 1,
    categoryIds: cats.map((c) => c.category_id),
    tagIds: tags.map((t) => t.tag_id),
    priceBandMin: row.price_band_min ?? "",
    priceBandMax: row.price_band_max ?? "",
    manualProducts: picks.map((p) => ({ id: p.id, name: p.name, sku: p.sku, imageUrl: p.image_url })),
  };
}

export interface CollectionInput {
  name: string;
  slug: string;
  description: string;
  imageUrl: string | null;
  isVisible: boolean;
  categoryIds: number[];
  tagIds: number[];
  priceBandMin: string;
  priceBandMax: string;
  /** Hand-picked products, in the order they should appear. */
  manualProductIds: number[];
}

/**
 * One end of a price band, as the DECIMAL string the column stores, or null
 * when left blank.
 *
 * Read the way prices get typed here — "75,000", "1,50,000", "Rs 50000",
 * "Rs. 50,000/-" — so grouping commas, spaces and the currency mark go first.
 * Anything that is still not a plain amount is refused. It used to become
 * NULL, which quietly removed that end of the band: "75,000" as a maximum
 * saved a collection of every price, and said it had worked.
 *
 * Parsed as digits rather than through `Number`, so the stored amount never
 * round-trips through a float; ten whole digits is what DECIMAL(12,2) holds.
 */
function priceBand(value: string, end: "minimum" | "maximum"): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const amount = raw
    .replace(/^(?:n?rs\.?|npr|inr|₹|रु\.?|रू\.?)\s*/i, "")
    .replace(/\/-$/, "")
    .replace(/[,\s]/g, "");
  const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(amount);
  if (!match) throw new Error(`The ${end} sale price must be an amount of 0 or more, like 75000 or 1,50,000.`);
  return `${match[1].replace(/^0+(?=\d)/, "")}.${(match[2] ?? "").padEnd(2, "0")}`;
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

/**
 * Replace the hand-picked products with the given list, `position` following
 * the array order — the drawer's up/down buttons ARE this order, so it is
 * stored rather than derived. Replace-in-full (not a diff) because the drawer
 * always submits the whole list; a partial write would leave a removed pick
 * behind. De-duplicated, since `collection_products` is keyed on the pair and a
 * repeat would otherwise abort the transaction.
 */
async function writeCollectionPicks(conn: import("mysql2/promise").PoolConnection, collectionId: number, productIds: number[]) {
  await conn.execute("DELETE FROM collection_products WHERE collection_id = ?", [collectionId]);
  const ids = [...new Set(productIds.filter((n) => Number.isInteger(n) && n > 0))];
  for (let i = 0; i < ids.length; i += 1) {
    await conn.execute(
      "INSERT INTO collection_products (collection_id, product_id, position) VALUES (?, ?, ?)",
      [collectionId, ids[i], i + 1],
    );
  }
}

export async function saveCollection(admin: AdminContext, id: number | null, input: CollectionInput): Promise<number> {
  const name = input.name.trim().slice(0, 150);
  if (!name) throw new Error("A name is required.");
  const min = priceBand(input.priceBandMin, "minimum");
  const max = priceBand(input.priceBandMax, "maximum");
  if (min != null && max != null && Number(min) > Number(max)) throw new Error("The price band's minimum is above its maximum.");

  return transaction(async (conn) => {
    let collectionId: number;
    if (id) {
      const [[current]] = await conn.execute<(RowDataPacket & { slug: string })[]>(
        "SELECT slug FROM collections WHERE id = ? LIMIT 1 FOR UPDATE",
        [id],
      );
      if (!current) throw new Error("This collection no longer exists — it may have been deleted by someone else.");
      const slug = await chooseSlug(conn, { table: "collections", id }, input.slug, name, current.slug);
      await conn.execute(
        `UPDATE collections SET name = ?, slug = ?, description = ?, image_url = ?, is_active = ?, price_band_min = ?, price_band_max = ? WHERE id = ?`,
        [name, slug, input.description.trim() || null, input.imageUrl || null, input.isVisible ? 1 : 0, min, max, id],
      );
      collectionId = id;
    } else {
      const slug = await chooseSlug(conn, { table: "collections", id: null }, input.slug, name, null);
      const [[maxRow]] = await conn.execute<(RowDataPacket & { next: number })[]>("SELECT COALESCE(MAX(sort_order),0)+1 AS next FROM collections");
      const [result] = await conn.execute<ResultSetHeader>(
        `INSERT INTO collections (name, slug, description, image_url, is_active, sort_order, price_band_min, price_band_max)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, slug, input.description.trim() || null, input.imageUrl || null, input.isVisible ? 1 : 0, maxRow.next, min, max],
      );
      collectionId = result.insertId;
    }
    await writeCollectionRules(conn, collectionId, input);
    await writeCollectionPicks(conn, collectionId, input.manualProductIds);
    await recordAdminAction(conn, admin, { action: id ? "collections.update" : "collections.create", resourceType: "collections", resourceId: collectionId, metadata: { name } });
    return collectionId;
  });
}

/**
 * Products matching a name or SKU search, for the collections drawer's "Add
 * products" control. A short capped list rather than the full picker: the
 * drawer is 452px and the task is "find this one piece and add it", not
 * "browse". `%` and `_` are escaped so a search for "_" means an underscore,
 * not every product.
 */
export async function searchProductsForPicks(term: string, limit = 12): Promise<CollectionPick[]> {
  const q = term.trim();
  if (q.length < 2) return [];
  const like = `%${escapeLike(q)}%`;
  const rows = await query<RowDataPacket & { id: number; name: string; sku: string; image_url: string | null }>(
    `SELECT id, name, sku, image_url FROM products
      WHERE (name LIKE ? ESCAPE '\\\\' OR sku LIKE ? ESCAPE '\\\\')
      ORDER BY name LIMIT ?`,
    [like, like, Math.min(Math.max(1, limit), 50)],
  );
  return rows.map((r) => ({ id: r.id, name: r.name, sku: r.sku, imageUrl: r.image_url }));
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
    // A tag's slug is a storefront URL like a category's, so it is checked
    // against every table /jewellery/{slug}.html resolves, rather than trusting
    // a random suffix not to land on one.
    const slug = await freeSlug(conn, slugify(clean), { table: "tags", id: null });
    // Last in its group. Left at the default 0 it sorted ahead of every tag in a
    // group whose order had been set (1..n) — a new tag jumped to the front.
    const [[maxRow]] = await conn.execute<(RowDataPacket & { next: number })[]>(
      "SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM tags WHERE group_id <=> ?",
      [groupId],
    );
    const [result] = await conn.execute<ResultSetHeader>(
      "INSERT INTO tags (name, slug, group_id, sort_order) VALUES (?, ?, ?, ?)",
      [clean, slug, groupId, maxRow.next],
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
 * Move a tag into a group and settle that group's order — one drop, one write.
 *
 * The two halves are inseparable: dragging a tag from Occasion into Style both
 * reassigns it and decides where in Style it lands, and doing them as separate
 * statements would leave a tag grouped but unpositioned if the second failed.
 * Reordering inside one group is the same call with the group unchanged.
 *
 * `orderedIds` is the destination group's membership as the screen now shows it,
 * including the moved tag, and it becomes `sort_order` 1..n. It is the user's
 * intent, so it can only come from the client — but it is not trusted:
 *
 *   - ids are sanitised to positive integers and de-duplicated, so a repeated id
 *     cannot make two tags fight over one position;
 *   - each UPDATE is constrained by `group_id <=> ?`, the null-safe equal, so a
 *     request can only renumber tags that really are in the group it claims to
 *     have reordered (and the Ungrouped bucket, `group_id IS NULL`, is matched by
 *     that same clause rather than needing a second statement);
 *   - the destination group is verified to exist first, so a stale id fails as a
 *     sentence rather than as an FK error with a constraint name in it.
 *
 * `tags.sort_order` has existed since migration 0011, so this needs no schema
 * change. `listTags` already reads `ORDER BY t.sort_order, t.name`, which is what
 * makes a tag left at the default 0 sort by name — the state every tag is in
 * until the first drag renumbers its group.
 */
export async function moveTag(
  admin: AdminContext,
  id: number,
  groupId: number | null,
  orderedIds: number[],
): Promise<void> {
  if (!Number.isInteger(id) || id <= 0) throw new Error("That tag no longer exists.");
  const ids = [...new Set(orderedIds.filter((n) => Number.isInteger(n) && n > 0))];

  await transaction(async (conn) => {
    if (groupId != null) {
      const [[group]] = await conn.execute<(RowDataPacket & { id: number })[]>(
        "SELECT id FROM tag_groups WHERE id = ? LIMIT 1",
        [groupId],
      );
      if (!group) throw new Error("That tag group no longer exists.");
    }

    const [moved] = await conn.execute<ResultSetHeader>("UPDATE tags SET group_id = ? WHERE id = ?", [groupId, id]);
    if (moved.affectedRows === 0) throw new Error("That tag no longer exists.");

    for (let i = 0; i < ids.length; i += 1) {
      await conn.execute("UPDATE tags SET sort_order = ? WHERE id = ? AND group_id <=> ?", [i + 1, ids[i], groupId]);
    }

    await recordAdminAction(conn, admin, {
      action: "tags.move",
      resourceType: "tags",
      resourceId: id,
      // `position` is 1-based and null when the moved tag is somehow not in the
      // order it was sent with — the audit says what happened, not what was meant.
      metadata: { groupId, position: ids.indexOf(id) + 1 || null, count: ids.length },
    });
  });
}

/**
 * Merge one tag into another: every product tagged with the source gains the
 * destination (INSERT IGNORE, so a product already carrying both does not clash),
 * every collection that auto-populates from the source does too, the source's
 * product links are removed, and the source tag is deleted — all in one
 * transaction. This is destructive and irreversible, so the caller confirms
 * first and the audit records exactly what merged into what.
 */
export async function mergeTag(admin: AdminContext, sourceId: number, destId: number): Promise<void> {
  if (sourceId === destId) throw new Error("Choose a different tag to merge into.");
  await transaction(async (conn) => {
    // Both ends are checked, and locked, before anything is copied. INSERT
    // IGNORE also downgrades a foreign-key failure to a warning, so merging
    // into a tag deleted in another tab used to copy nothing, delete the
    // source anyway, and strip the tag from every product without a word.
    const [found] = await conn.execute<(RowDataPacket & { id: number })[]>(
      "SELECT id FROM tags WHERE id IN (?, ?) FOR UPDATE",
      [sourceId, destId],
    );
    if (!found.some((t) => t.id === sourceId)) throw new Error("That tag no longer exists — it may already have been merged or deleted.");
    if (!found.some((t) => t.id === destId)) throw new Error("The tag you chose to merge into no longer exists. Choose another.");

    await conn.execute(
      "INSERT IGNORE INTO product_tags (product_id, tag_id) SELECT product_id, ? FROM product_tags WHERE tag_id = ?",
      [destId, sourceId],
    );
    // The source's collection rules cascade away with it (fk_ct_tag), which
    // used to empty any collection built on that tag. They move instead.
    await conn.execute(
      "INSERT IGNORE INTO collection_tags (collection_id, tag_id) SELECT collection_id, ? FROM collection_tags WHERE tag_id = ?",
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
