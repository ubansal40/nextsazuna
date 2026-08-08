import "server-only";

import type { PoolConnection } from "mysql2/promise";
import { headers } from "next/headers";
import { requestIp } from "../rate-limit";
import type { AdminContext } from "./rbac";

/**
 * Record an admin action — inside the caller's transaction.
 *
 * The reference's audit is fire-and-forget and runs AFTER the commit, so an
 * audit failure leaves a committed change with no trail, and a rolled-back
 * change can still leave a log line claiming it happened. Here the insert shares
 * the connection — and therefore the transaction — of the change it records, so
 * the two commit or roll back together: no phantom entries, no silent gaps.
 *
 * The IP is read with `requestIp` (the last proxy hop), not a forgeable
 * `X-Forwarded-For` prefix, and the actor is the freshly re-read admin, never a
 * client-supplied id.
 */
export async function recordAdminAction(
  connection: PoolConnection,
  admin: Pick<AdminContext, "id" | "email">,
  entry: {
    action: string;
    resourceType: string;
    resourceId?: string | number | null;
    metadata?: Record<string, unknown> | null;
  },
): Promise<void> {
  const hdrs = await headers();
  await connection.execute(
    `INSERT INTO admin_audit_log
       (admin_id, admin_email, action, resource_type, resource_id, metadata_json, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      admin.id,
      admin.email,
      entry.action,
      entry.resourceType,
      entry.resourceId == null ? null : String(entry.resourceId),
      entry.metadata ? JSON.stringify(entry.metadata) : null,
      requestIp(hdrs),
      hdrs.get("user-agent")?.slice(0, 500) ?? null,
    ],
  );
}
