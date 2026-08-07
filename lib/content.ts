import "server-only";

import { queryOne } from "./db";
import type { RowDataPacket } from "mysql2";

/**
 * Editable content blocks.
 *
 * `content_blocks` is a key → JSON store the admin writes to. Readers ask for a
 * key and get a parsed value, or null when the block is absent or unpublished.
 *
 * Every read is defensive: this is admin-authored JSON, so a malformed value
 * must degrade to "no content" rather than throwing and taking down a page that
 * would otherwise render perfectly well without it.
 */

interface ContentRow extends RowDataPacket {
  value: string | object | null;
}

export async function getContentBlock<T>(key: string): Promise<T | null> {
  const row = await queryOne<ContentRow>(
    "SELECT `value` FROM content_blocks WHERE `key` = ? AND is_published = 1 LIMIT 1",
    [key],
  );
  if (!row?.value) return null;

  // MariaDB stores JSON as LONGTEXT, so the driver may hand back either a
  // parsed object or the raw string depending on column type detection.
  if (typeof row.value === "object") return row.value as T;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

/** Editorial copy shown under a category title, keyed by category slug. */
export async function getCategoryIntro(slug: string): Promise<string | null> {
  const intros = await getContentBlock<Record<string, unknown>>("category_intros");
  const copy = intros?.[slug];
  return typeof copy === "string" && copy.trim() ? copy : null;
}
