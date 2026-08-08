import { requireAdmin } from "@/lib/admin/require";
import { visibleNav } from "@/lib/admin/nav";
import { AdminShell } from "@/components/admin/admin-shell";

/**
 * The guarded admin. Everything under here is behind `requireAdmin()` and wears
 * the shell — the login sits OUTSIDE this group so a signed-out person can reach
 * it. Route groups are erased from the URL, so these pages are still `/admin`,
 * `/admin/products`, and so on.
 *
 * The layout is the convenience gate. It is not the whole guard: every Server
 * Action and Route Handler still calls `requireSection` itself, because a layout
 * does not run before an action the way it runs before a page.
 */
export default async function AuthedAdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();

  return (
    <AdminShell
      admin={{ name: admin.name, email: admin.email, isOwner: admin.isOwner }}
      nav={visibleNav(admin)}
      environment={process.env.NODE_ENV === "production" ? "production" : "development"}
    >
      {children}
    </AdminShell>
  );
}
