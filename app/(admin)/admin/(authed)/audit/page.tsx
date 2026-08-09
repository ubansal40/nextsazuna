import type { Metadata } from "next";
import { requireOwner } from "@/lib/admin/require";
import { listAuditLog } from "@/lib/admin/audit-log";

export const metadata: Metadata = { title: "Audit log", robots: { index: false, follow: false } };

/**
 * The audit log — owner only.
 *
 * A Server Component with `searchParams` rather than a client screen: this is a
 * read-only list with no mutations, so there is nothing for client state to do
 * that a URL cannot, and a linkable filtered view is more useful here than a
 * stateful one.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; q?: string; page?: string }>;
}) {
  await requireOwner();
  const { action, q, page } = await searchParams;
  const result = await listAuditLog({ action, search: q, page: Number(page) || 1 });

  return (
    <div className="mx-auto max-w-[1100px]">
      <div className="mb-4">
        <h2 className="font-display text-2xl font-medium text-heading">Audit log</h2>
        <p className="mt-1 text-[12.5px] text-muted">
          Every change an admin made, written inside the transaction that made it. Append-only — nothing here can be
          edited or removed.
        </p>
      </div>

      <form method="get" className="mb-3 flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Admin, resource type or id"
          aria-label="Search the audit log"
          className="min-h-11 flex-1 rounded-[var(--sz-admin-radius-control)] border border-line bg-admin-canvas px-2.5 text-[13px] text-body outline-none placeholder:text-muted focus-visible:border-primary-700"
        />
        <select
          name="action"
          defaultValue={action ?? "all"}
          aria-label="Filter by action"
          className="min-h-11 rounded-[var(--sz-admin-radius-control)] border border-line bg-raised px-2.5 text-[13px] text-body"
        >
          <option value="all">Any action</option>
          {result.actions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="min-h-11 rounded-[var(--sz-admin-radius-control)] bg-primary-700 px-4 text-[13px] font-semibold text-white hover:bg-primary-800"
        >
          Filter
        </button>
      </form>

      <div className="overflow-x-auto rounded-[var(--sz-admin-radius-card)] border border-line bg-raised">
        <table className="w-full min-w-[820px] text-[13px]">
          <thead>
            <tr className="border-b border-line-soft text-left text-xs text-muted">
              <th className="px-3 py-2.5 font-medium">When</th>
              <th className="px-3 py-2.5 font-medium">Admin</th>
              <th className="px-3 py-2.5 font-medium">Action</th>
              <th className="px-3 py-2.5 font-medium">Resource</th>
              <th className="px-3 py-2.5 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {result.entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-[13px] text-muted">
                  Nothing matches these filters.
                </td>
              </tr>
            ) : (
              result.entries.map((entry) => (
                <tr key={entry.id} className="border-b border-line-soft last:border-0 align-top">
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-muted">
                    {new Date(entry.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                  </td>
                  <td className="px-3 py-2.5 text-[12.5px] text-body">{entry.adminEmail ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11.5px] font-semibold text-primary-700">
                    {entry.action}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11.5px] text-muted">
                    {entry.resourceType}
                    {entry.resourceId ? ` #${entry.resourceId}` : ""}
                  </td>
                  <td className="px-3 py-2.5">
                    {entry.metadata ? (
                      <code className="block max-w-[380px] overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10.5px] text-muted">
                        {JSON.stringify(entry.metadata)}
                      </code>
                    ) : (
                      <span className="text-[11px] text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[11px] text-muted">
          {result.total.toLocaleString("en-IN")} entries · page {result.page} of {result.totalPages}
        </p>
        <div className="flex gap-2">
          {result.page > 1 && (
            <a href={buildHref({ action, q, page: result.page - 1 })} className={pagerClass}>
              Previous
            </a>
          )}
          {result.page < result.totalPages && (
            <a href={buildHref({ action, q, page: result.page + 1 })} className={pagerClass}>
              Next
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function buildHref({ action, q, page }: { action?: string; q?: string; page: number }): string {
  const params = new URLSearchParams();
  if (action && action !== "all") params.set("action", action);
  if (q) params.set("q", q);
  params.set("page", String(page));
  return `/admin/audit?${params.toString()}`;
}

const pagerClass =
  "inline-flex min-h-10 items-center rounded-[var(--sz-admin-radius-control)] border border-line bg-raised px-3.5 text-[12.5px] font-semibold text-body hover:border-primary-700";
