import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/require";
import { ADMIN_SECTIONS, authorizeSection } from "@/lib/admin/rbac";
import { adminSignOut } from "./_actions";

/**
 * Admin home — a placeholder landing, not the shell.
 *
 * This exists so sign-in has a destination and can be verified end to end today:
 * it is guarded, it greets the admin, it lists the sections they may enter, and
 * it signs them out. The real chrome — sidebar, section gating, audit — is the
 * next step and replaces the body of this page; the guard and the sign-out stay.
 *
 * The section links are gated by the same `authorizeSection` the routes
 * themselves will use, so a staffer never sees a door they cannot open. Most
 * targets 404 until their screens are built — that is expected at this step.
 */

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default async function AdminHomePage() {
  const admin = await requireAdmin();
  const reachable = ADMIN_SECTIONS.filter((section) => authorizeSection(admin, section.key));

  return (
    <main className="mx-auto min-h-dvh max-w-[720px] px-6 py-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-display text-[length:var(--sz-text-page-title-sm)] leading-none text-heading">
            Sazuna Admin
          </p>
          <p className="mt-2 text-sm text-muted">
            Signed in as {admin.name?.trim() || admin.email}
            {admin.isOwner ? " · Owner" : ""}
          </p>
        </div>
        <form action={adminSignOut}>
          <button
            type="submit"
            className="inline-flex min-h-11 cursor-pointer items-center rounded-[var(--sz-radius-control)] border border-line bg-raised px-4 text-sm font-semibold text-body hover:border-primary-700 hover:text-primary-700"
          >
            Sign out
          </button>
        </form>
      </header>

      <section className="mt-10">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Sections</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {reachable.map((section) => (
            <li key={section.key}>
              <Link
                href={section.path}
                className="flex min-h-12 items-center rounded-[var(--sz-radius-control)] border border-line bg-raised px-4 text-control font-semibold text-body no-underline hover:border-primary-700 hover:text-primary-700 hover:no-underline"
              >
                {section.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
