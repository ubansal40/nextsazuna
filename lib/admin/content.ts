import "server-only";

import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { queryOne, transaction } from "../db";
import { recordAdminAction } from "./audit";
import type { EditableBlockKey } from "./content-keys";
import type { AdminContext } from "./rbac";

/**
 * Reading and writing the editable content blocks.
 *
 * Every function here takes `EditableBlockKey`, never `string` — that is what
 * keeps `payment_methods` out of the admin's reach. See `./content-keys` for
 * why that matters more than it looks.
 *
 * The value column is `JSON`, which on MariaDB is an alias for LONGTEXT: there
 * is no database-level validation, and the driver hands back either a parsed
 * object or the raw string depending on how it typed the column. Both halves of
 * that are handled here rather than at every call site.
 */

interface BlockRow extends RowDataPacket {
  value: string | object;
  is_published: number;
  updated_by: string | null;
  updated_at: Date;
}

export interface ContentBlock<T = unknown> {
  key: EditableBlockKey;
  value: T | null;
  isPublished: boolean;
  updatedBy: string | null;
  updatedAt: Date | null;
}

/**
 * Read one block for editing.
 *
 * Unlike the storefront's `getContentBlock`, this does NOT filter on
 * `is_published` — an unpublished block still has to be editable, or the only
 * way back from hiding something is a database client.
 *
 * A malformed value comes back as `null` rather than throwing. The editor then
 * shows its empty state, which is recoverable; a thrown parse error in a Server
 * Component is not.
 */
export async function getEditableBlock<T = unknown>(key: EditableBlockKey): Promise<ContentBlock<T>> {
  const row = await queryOne<BlockRow>(
    "SELECT `value`, is_published, updated_by, updated_at FROM content_blocks WHERE `key` = ? LIMIT 1",
    [key],
  );
  if (!row) return { key, value: null, isPublished: true, updatedBy: null, updatedAt: null };

  let value: T | null = null;
  try {
    value = (typeof row.value === "string" ? JSON.parse(row.value) : row.value) as T;
  } catch {
    // Malformed JSON in the column. The editor's empty state is the honest
    // answer — pretending it parsed would let a save overwrite it silently.
    value = null;
  }

  return {
    key,
    value,
    isPublished: Number(row.is_published) === 1,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at ?? null,
  };
}

/**
 * Write one block, with its audit line, in one transaction.
 *
 * `JSON.stringify` rather than `CAST(? AS JSON)`: the column is LONGTEXT under
 * MariaDB, so the cast buys nothing and fails on some driver/server pairs.
 *
 * The audit insert shares the connection deliberately. The reference app
 * recorded the action after committing and outside any transaction, so a failed
 * log left a committed change with no trail — and a rolled-back change could
 * leave a log line claiming it happened.
 */
export async function saveEditableBlock(
  admin: AdminContext,
  key: EditableBlockKey,
  value: unknown,
  meta: { summary?: string } = {},
): Promise<void> {
  const json = JSON.stringify(value);
  await transaction(async (conn: PoolConnection) => {
    await conn.execute(
      "INSERT INTO content_blocks (`key`, `value`, is_published, updated_by) VALUES (?, ?, 1, ?) " +
        "ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_by = VALUES(updated_by)",
      [key, json, admin.email],
    );
    await recordAdminAction(conn, admin, {
      action: "content.update",
      resourceType: "content_block",
      resourceId: key,
      metadata: { bytes: json.length, ...(meta.summary ? { summary: meta.summary } : {}) },
    });
  });
}
