"use client";

import { useState, useTransition } from "react";
import { Icon, useToast } from "@/components/ui";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { ProductThumb } from "@/components/admin/product-thumb";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import type { AdminOrderFilters, AdminOrderPage, AdminOrderRow } from "@/lib/admin/orders";
import type { OrderStatusRow } from "@/lib/admin/order-statuses";
import { STATUS_CHIP } from "./status-badge";
import { StatusManager } from "./status-manager";
import {
  loadOrdersAction,
  setOrdersStatusAction,
  softDeleteOrdersAction,
  type OrdersResult,
} from "../_actions";

/**
 * Orders list — Sazuna Admin Orders.dc.html.
 *
 * Quick tabs come from the configurable statuses rather than a fixed ladder, so
 * adding "Awaiting stone setting" in the drawer puts a tab here and an option in
 * every dropdown without a code change. Each tab keeps its own count even while
 * another is selected.
 *
 * Deleting is a soft delete: an order is a seven-year tax record, so the row is
 * hidden, never removed.
 */

export function OrdersScreen({
  initialPage,
  initialStatuses,
}: {
  initialPage: AdminOrderPage;
  initialStatuses: OrderStatusRow[];
}) {
  const { toast } = useToast();
  const [page, setPage] = useState(initialPage);
  const [statuses, setStatuses] = useState(initialStatuses);
  const [filters, setFilters] = useState<AdminOrderFilters>({});
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkTo, setBulkTo] = useState("");
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [managing, setManaging] = useState(false);
  const [busy, startTransition] = useTransition();

  function handle(result: OrdersResult, ok?: string) {
    if (result.ok) {
      setPage(result.page);
      if (ok) toast("success", ok);
    } else {
      toast("error", result.error);
    }
  }

  /** Every list change goes through here, so the filters the server sees and the
   *  ones the UI shows can never drift apart. */
  function apply(next: AdminOrderFilters) {
    setFilters(next);
    setSelected(new Set());
    startTransition(async () => handle(await loadOrdersAction(next)));
  }

  function toggle(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  const allChecked = page.rows.length > 0 && page.rows.every((r) => selected.has(r.id));

  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(page.rows.map((r) => r.id)));
  }

  function changeStatus(orderIds: number[], statusKey: string, label: string) {
    startTransition(async () => {
      const result = await setOrdersStatusAction(orderIds, statusKey, filters);
      if (result.ok) setSelected(new Set());
      handle(result, `Moved to ${label}.`);
    });
  }

  const tabs = [
    { key: "all", label: "All", count: page.tabCounts.all ?? 0 },
    ...statuses.map((s) => ({ key: s.key, label: s.label, count: page.tabCounts[s.key] ?? 0 })),
  ];
  const activeTab = filters.status ?? "all";

  return (
    <div className="mx-auto max-w-[1180px]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-medium text-heading">Orders</h2>
        <button
          type="button"
          onClick={() => setManaging(true)}
          className="inline-flex min-h-10 items-center gap-2 rounded-[var(--sz-admin-radius-control)] border border-line bg-raised px-3.5 text-[13px] font-semibold text-body hover:border-primary-700"
        >
          <Icon name="sort" size={15} /> Manage statuses
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
            <Icon name="search" size={16} />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") apply({ ...filters, search, page: 1 });
            }}
            aria-label="Search orders by number, customer name or phone"
            placeholder="Order #, name or phone"
            className="min-h-11 w-full rounded-[var(--sz-admin-radius-control)] border border-line bg-admin-canvas pl-9 pr-3 text-[13px] text-body outline-none placeholder:text-muted focus-visible:border-primary-700"
          />
        </div>
        <select
          value={filters.paymentStatus ?? "all"}
          onChange={(e) => apply({ ...filters, paymentStatus: e.target.value, page: 1 })}
          aria-label="Filter by payment status"
          className="min-h-11 rounded-[var(--sz-admin-radius-control)] border border-line bg-raised px-2.5 text-[13px] text-body"
        >
          <option value="all">Any payment</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="failed">Failed</option>
          <option value="refunded">Refunded</option>
        </select>
        <select
          value={filters.sort ?? "newest"}
          onChange={(e) => apply({ ...filters, sort: e.target.value, page: 1 })}
          aria-label="Sort orders"
          className="min-h-11 rounded-[var(--sz-admin-radius-control)] border border-line bg-raised px-2.5 text-[13px] text-body"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="total_desc">Highest total</option>
          <option value="total_asc">Lowest total</option>
        </select>
      </div>

      <div role="tablist" aria-label="Order status" className="mb-3 flex flex-wrap gap-1.5">
        {tabs.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => apply({ ...filters, status: tab.key, page: 1 })}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-[var(--sz-admin-radius-control)] border px-3 text-[12.5px] font-semibold",
                active ? "border-primary-700 bg-primary-700 text-white" : "border-line bg-raised text-body hover:border-accent",
              )}
            >
              {tab.label}
              <span className={cn("rounded-pill px-1.5 font-mono text-[10px]", active ? "bg-white/20" : "bg-surface text-muted")}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-[var(--sz-admin-radius-card)] border border-line bg-raised">
        <table className="w-full min-w-[900px] text-[13px]">
          <thead>
            <tr className="border-b border-line-soft text-left text-xs text-muted">
              <th className="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  aria-label="Select all loaded orders"
                  className="size-4 accent-[var(--sz-primary-700)]"
                />
              </th>
              <th className="px-3 py-2.5 font-medium">Order #</th>
              <th className="px-3 py-2.5 font-medium">Date</th>
              <th className="px-3 py-2.5 font-medium">Customer</th>
              <th className="px-3 py-2.5 font-medium">Items</th>
              <th className="whitespace-nowrap px-3 py-2.5 font-medium">Total</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Payment</th>
            </tr>
          </thead>
          <tbody>
            {page.rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-[13px] text-muted">
                  No orders match these filters.
                </td>
              </tr>
            ) : (
              page.rows.map((row) => (
                <OrderTr
                  key={row.id}
                  row={row}
                  statuses={statuses}
                  checked={selected.has(row.id)}
                  onToggle={() => toggle(row.id)}
                  onStatus={(key, label) => changeStatus([row.id], key, label)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[11px] text-muted">
          {page.total.toLocaleString("en-IN")} order{page.total === 1 ? "" : "s"} · page {page.page} of {page.totalPages}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page.page <= 1 || busy}
            onClick={() => apply({ ...filters, page: page.page - 1 })}
            className={pagerButton}
          >
            Previous
          </button>
          <button
            type="button"
            disabled={page.page >= page.totalPages || busy}
            onClick={() => apply({ ...filters, page: page.page + 1 })}
            className={pagerButton}
          >
            Next
          </button>
        </div>
      </div>

      {selected.size > 0 && (
        <div
          role="region"
          aria-label="Bulk actions"
          className="fixed bottom-5 left-1/2 z-[900] flex -translate-x-1/2 flex-wrap items-center gap-2.5 rounded-[13px] bg-body px-3 py-2.5 shadow-[var(--sz-shadow-modal)]"
        >
          <span className="px-1 font-mono text-xs font-semibold text-canvas">{selected.size} selected</span>
          <select
            value={bulkTo}
            onChange={(e) => setBulkTo(e.target.value)}
            aria-label="Move selected orders to status"
            className="min-h-10 max-w-[190px] rounded-[9px] border-none bg-canvas px-2.5 text-[12.5px] font-semibold text-heading"
          >
            <option value="">Move to…</option>
            {statuses.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!bulkTo || busy}
            onClick={() => setConfirmBulk(true)}
            className="min-h-10 rounded-[9px] bg-primary-700 px-4 text-[12.5px] font-semibold text-white hover:bg-primary-800 disabled:opacity-50"
          >
            Apply
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
            className="min-h-10 rounded-[9px] px-3 text-[12.5px] font-semibold text-canvas hover:bg-white/10"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            aria-label="Clear selection"
            className="inline-flex size-10 items-center justify-center rounded-[9px] text-canvas hover:bg-white/10"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmBulk}
        title="Change status?"
        confirmLabel="Move them"
        busy={busy}
        onCancel={() => setConfirmBulk(false)}
        onConfirm={() => {
          setConfirmBulk(false);
          const label = statuses.find((s) => s.key === bulkTo)?.label ?? bulkTo;
          changeStatus([...selected], bulkTo, label);
        }}
        body={
          <>
            {selected.size} order{selected.size === 1 ? "" : "s"} will move to{" "}
            <strong className="text-body">{statuses.find((s) => s.key === bulkTo)?.label ?? bulkTo}</strong>. Orders
            already on that status are left alone.
          </>
        }
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Delete these orders?"
        tone="danger"
        confirmLabel="Delete"
        busy={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          startTransition(async () => {
            const result = await softDeleteOrdersAction([...selected], filters);
            if (result.ok) setSelected(new Set());
            handle(result, "Orders deleted.");
          });
        }}
        body={
          <>
            {selected.size} order{selected.size === 1 ? "" : "s"} will be hidden from this list. Orders are tax records,
            so nothing is erased — they can be restored from the database.
          </>
        }
      />

      {managing && (
        <StatusManager
          statuses={statuses}
          onClose={() => setManaging(false)}
          onChanged={(next) => {
            setStatuses(next);
            // Tab counts and row labels both come from statuses, so the list is
            // refetched rather than patched.
            startTransition(async () => handle(await loadOrdersAction(filters)));
          }}
        />
      )}
    </div>
  );
}

function OrderTr({
  row,
  statuses,
  checked,
  onToggle,
  onStatus,
}: {
  row: AdminOrderRow;
  statuses: OrderStatusRow[];
  checked: boolean;
  onToggle: () => void;
  onStatus: (key: string, label: string) => void;
}) {
  const date = new Date(row.createdAt);
  return (
    <tr className={cn("border-b border-line-soft last:border-0", checked && "bg-admin-canvas")}>
      <td className="px-3 py-2.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          aria-label={`Select order ${row.orderNumber}`}
          className="size-4 accent-[var(--sz-primary-700)]"
        />
      </td>
      <td className="whitespace-nowrap px-3 py-2.5">
        <a
          href={`/admin/orders/${row.id}`}
          className="font-mono text-[12.5px] font-semibold text-primary-700 underline underline-offset-2"
        >
          {row.orderNumber}
        </a>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11.5px] text-muted">
        {date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
      </td>
      <td className="px-3 py-2.5">
        <span className="block max-w-[200px] truncate font-medium text-heading">{row.customerName}</span>
        <span className="font-mono text-[11px] text-muted">{row.phone}</span>
      </td>
      <td className="px-3 py-2.5">
        <span className="flex items-center gap-1.5">
          {row.thumbs.map((src, i) => (
            <ProductThumb key={i} src={src} alt="" size={26} />
          ))}
          <span className="whitespace-nowrap font-mono text-[11px] text-muted">
            {row.itemCount} item{row.itemCount === 1 ? "" : "s"}
          </span>
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[13px] font-semibold text-heading">
        {formatPrice(row.total)}
      </td>
      <td className="px-3 py-2.5">
        <select
          value={row.status}
          onChange={(e) => {
            const next = statuses.find((s) => s.key === e.target.value);
            if (next) onStatus(next.key, next.label);
          }}
          aria-label={`Status for order ${row.orderNumber}`}
          className={cn(
            "min-h-9 max-w-[160px] rounded-[var(--sz-admin-radius-control)] border px-2 text-[12px] font-semibold",
            STATUS_CHIP[row.statusColour],
          )}
        >
          {statuses.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
          {/* A status removed out of band still renders its own row truthfully. */}
          {!statuses.some((s) => s.key === row.status) && <option value={row.status}>{row.statusLabel}</option>}
        </select>
      </td>
      <td className="px-3 py-2.5">
        <span className="block text-xs capitalize text-body">{row.paymentMethod}</span>
        <span
          className={cn(
            "font-mono text-[10px] font-semibold capitalize",
            row.paymentStatus === "paid" ? "text-success" : row.paymentStatus === "failed" ? "text-error" : "text-muted",
          )}
        >
          {row.paymentStatus}
        </span>
      </td>
    </tr>
  );
}

const pagerButton =
  "inline-flex min-h-10 items-center rounded-[var(--sz-admin-radius-control)] border border-line bg-raised px-3.5 text-[12.5px] font-semibold text-body hover:border-primary-700 disabled:opacity-40 disabled:hover:border-line";
