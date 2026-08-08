import "server-only";

import { redirect } from "next/navigation";
import { currentAdmin } from "./session";
import type { AdminContext } from "./rbac";

/**
 * Require a signed-in admin, or send them to the login page.
 *
 * This is the guard a page or the admin layout calls. It is not, on its own, the
 * whole story: a layout guard is UI convenience, and every Server Action and
 * Route Handler still re-checks for itself, because a layout does not run before
 * an action the way it runs before a page.
 *
 * Section-level gating (`requireSection`) arrives with the admin shell in the
 * next step; this establishes only that there IS an authenticated admin.
 */
export async function requireAdmin(): Promise<AdminContext> {
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}
