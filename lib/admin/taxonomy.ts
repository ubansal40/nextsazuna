import "server-only";

import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { query, transaction } from "../db";
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
