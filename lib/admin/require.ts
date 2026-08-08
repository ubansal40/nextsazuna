import "server-only";

import { redirect } from "next/navigation";
import { currentAdmin } from "./session";
import { authorizeSection, type AdminContext } from "./rbac";

/**
 * Require a signed-in admin, or send them to the login page.
 *
 * The guard a page or the admin layout calls. It is not, on its own, the whole
 * story: a layout guard is UI convenience, and every Server Action and Route
 * Handler still re-checks for itself, because a layout does not run before an
 * action the way it runs before a page.
 */
export async function requireAdmin(): Promise<AdminContext> {
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

/**
 * Require a signed-in admin who holds a given section — the mandatory
 * authorization gate. Every gated page, Route Handler and Server Action calls
 * it. Deny-by-default: the owner bypasses (`authorizeSection`), a staffer
 * without the grant is bounced to the dashboard, which every admin can see.
 *
 * (A staffer never sees the sidebar link for a section they lack, so this only
 * catches a hand-typed URL. A richer in-shell "Unauthorized" panel replaces the
 * bounce once staff roles are in play.)
 */
export async function requireSection(section: string): Promise<AdminContext> {
  const admin = await requireAdmin();
  if (!authorizeSection(admin, section)) redirect("/admin");
  return admin;
}
