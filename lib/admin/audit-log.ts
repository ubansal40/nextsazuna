import "server-only";

import type { RowDataPacket } from "mysql2";
import { query } from "../db";
import { escapeLike } from "./catalog";

/**
 * Reading the audit trail.
 *
 * `lib/admin/audit.ts` writes it — always inside the transaction of the change
 * it records, so an action and its evidence commit or roll back together. This
 * is the read half, for the owner-only viewer.
 *
 * Append-only by construction: nothing here updates or deletes, and no screen
 * offers to. An audit log a user can edit is not an audit log.
 */

export interface AuditEntry {
  id: number;
  adminEmail: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: unknown;
  ip: string | null;
  createdAt: string;
}

export interface AuditPage {
  entries: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** Distinct actions present, for the filter select. */
  actions: string[];
}

const PAGE_SIZE = 50;

interface AuditDbRow extends RowDataPacket {
  id: number;
  admin_email: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata_json: unknown;
  ip: string | null;
  created_at: Date;
}

export async function listAuditLog(filters: { action?: string; search?: string; page?: number } = {}): Promise<AuditPage> {
  const page = Math.max(1, filters.page ?? 1);
  const clauses: string[] = ["1=1"];
  const params: (string | number)[] = [];

  if (filters.action && filters.action !== "all") {
    clauses.push("action = ?");
    params.push(filters.action);
  }
  const search = filters.search?.trim();
  if (search) {
    // Escaped, like every other search in the admin: a bare `_` must not match
    // every row in the table.
    const like = `%${escapeLike(search)}%`;
    clauses.push("(admin_email LIKE ? ESCAPE '\\\\' OR resource_type LIKE ? ESCAPE '\\\\' OR resource_id LIKE ? ESCAPE '\\\\')");
    params.push(like, like, like);
  }
  const where = clauses.join(" AND ");

  const [rows, [countRow], actionRows] = await Promise.all([
    query<AuditDbRow>(
      `SELECT id, admin_email, action, resource_type, resource_id, metadata_json, ip, created_at
         FROM admin_audit_log WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE],
    ),
    query<RowDataPacket & { n: number }>(`SELECT COUNT(*) AS n FROM admin_audit_log WHERE ${where}`, params),
    query<RowDataPacket & { action: string }>("SELECT DISTINCT action FROM admin_audit_log ORDER BY action"),
  ]);

  const total = Number(countRow?.n ?? 0);
  return {
    entries: rows.map((r) => ({
      id: r.id,
      adminEmail: r.admin_email,
      action: r.action,
      resourceType: r.resource_type,
      resourceId: r.resource_id,
      metadata: r.metadata_json,
      ip: r.ip,
      createdAt: (r.created_at instanceof Date ? r.created_at : new Date(r.created_at)).toISOString(),
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    actions: actionRows.map((r) => r.action),
  };
}
