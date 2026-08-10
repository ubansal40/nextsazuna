"use client";

import { useEffect, useState, useTransition } from "react";
import { Icon, useToast } from "@/components/ui";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Switch } from "@/components/admin/switch";
import { cn } from "@/lib/cn";
import { STATUS_COLOURS, type StatusColour } from "@/lib/admin/order-status-colours";
import type { OrderStatusRow } from "@/lib/admin/order-statuses";
import { STATUS_DOT } from "./status-badge";
import {
  loadStatusesAction,
  createStatusAction,
  updateStatusAction,
  setDefaultStatusAction,
  reorderStatusesAction,
  deleteStatusAction,
  type StatusesResult,
} from "../_actions";

/**
 * "Manage statuses" — the drawer from Sazuna Admin Orders.dc.html.
 *
 * This one list drives the quick tabs, every status dropdown and the customer
 * timeline, so the spec puts rename, colour, order, timeline visibility and the
 * default all in one place. System statuses can be relabelled and recoloured
 * but not deleted: they carry side-effects the platform depends on.
 *
 * Deleting a custom status that orders are sitting on requires somewhere to move
 * them — orders pointing at a key with no row would render as a bare key
 * everywhere the label is joined.
 *
 * **Reordering is by button.** The grip used to be a `role="button"` span that
 * answered only to the arrow keys — so the two keys the role promises, Enter and
 * Space, did nothing, and a touch device had no path at all. Two real buttons
 * say what they do, are reachable by finger and by keyboard, and go through the
 * same move as the drag, which stays as a desktop shortcut on the row.
 */

/** Move one entry from `from` to `to`. The buttons and the drop share it, so the
 *  two paths cannot drift into different operations. */
function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function StatusManager({
  statuses,
  onClose,
  onChanged,
}: {
  statuses: OrderStatusRow[];
  onClose: () => void;
  onChanged: (next: OrderStatusRow[]) => void;
}) {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [paletteFor, setPaletteFor] = useState<number | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newColour, setNewColour] = useState<StatusColour>("gold");
  const [deleting, setDeleting] = useState<OrderStatusRow | null>(null);
  const [reassignTo, setReassignTo] = useState("");
  const [dragId, setDragId] = useState<number | null>(null);
  const [busy, startTransition] = useTransition();

  function handle(result: StatusesResult, ok?: string) {
    if (result.ok) {
      onChanged(result.statuses);
      if (ok) toast("success", ok);
    } else {
      toast("error", result.error);
    }
  }

  function run(action: () => Promise<StatusesResult>, ok?: string) {
    startTransition(async () => handle(await action(), ok));
  }

  /**
   * Re-read the statuses when the drawer opens.
   *
   * `orderCount` goes stale the moment anyone changes an order's status on the
   * list behind this drawer, and it is what decides whether deleting a status
   * demands somewhere to move its orders. Without this the dialog cheerfully
   * says "no orders are on this status" and the delete then fails on the server
   * guard — the data stays safe, but the screen has lied.
   */
  useEffect(() => {
    startTransition(async () => {
      const result = await loadStatusesAction();
      if (result.ok) onChanged(result.statuses);
    });
    // Deliberately on mount only: the drawer is unmounted when closed, so this
    // runs once per open, and re-running on every `onChanged` would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function saveRename(status: OrderStatusRow) {
    const label = draftLabel.trim();
    setEditingId(null);
    if (!label || label === status.label) return;
    run(() => updateStatusAction(status.id, { label }), "Status renamed.");
  }

  /** Apply the new order locally, persist it, and put the previous order back
   *  exactly if the server refuses — this order drives the quick tabs and every
   *  dropdown, so a list left ahead of the database misinforms every screen that
   *  reads it until someone happens to reopen the drawer. */
  function persistOrder(next: OrderStatusRow[]) {
    const before = statuses;
    onChanged(next);
    startTransition(async () => {
      const result = await reorderStatusesAction(next.map((s) => s.id));
      if (result.ok) {
        onChanged(result.statuses);
      } else {
        onChanged(before);
        toast("error", result.error);
      }
    });
  }

  function onDrop(target: OrderStatusRow) {
    if (dragId === null || dragId === target.id) return;
    const from = statuses.findIndex((s) => s.id === dragId);
    const to = statuses.findIndex((s) => s.id === target.id);
    setDragId(null);
    if (from < 0 || to < 0) return;
    persistOrder(moveItem(statuses, from, to));
  }

  /** One step up or down — the same move the drag performs, over one place. */
  function move(status: OrderStatusRow, delta: number) {
    const from = statuses.findIndex((s) => s.id === status.id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= statuses.length) return;
    persistOrder(moveItem(statuses, from, to));
  }

  const deleteTargets = deleting ? statuses.filter((s) => s.id !== deleting.id) : [];

  return (
    <>
      <button type="button" aria-label="Close" onClick={onClose} className="fixed inset-0 z-40 bg-[var(--sz-overlay)]" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Manage order statuses"
        className="fixed inset-y-0 right-0 z-50 flex w-[min(452px,100vw)] flex-col bg-raised shadow-[var(--sz-shadow-drawer)]"
      >
        <div className="flex items-center gap-3 border-b border-line px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-md font-medium text-heading">Order statuses</h3>
            <p className="mt-0.5 text-[11.5px] text-muted">
              This order sets the quick tabs, every status dropdown and the customer timeline.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-10 items-center justify-center rounded-[7px] text-muted hover:bg-admin-canvas"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3.5 py-3">
          <ul className="space-y-2">
            {statuses.map((status, index) => (
              <li
                key={status.id}
                draggable
                onDragStart={() => setDragId(status.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(status)}
                onDragEnd={() => setDragId(null)}
                className={cn(
                  "rounded-[11px] border border-line bg-canvas",
                  dragId === status.id && "opacity-50",
                )}
              >
                <div className="flex items-center gap-1.5 p-2">
                  <button
                    type="button"
                    onClick={() => move(status, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${status.label} up`}
                    title="Move up"
                    className={reorderButton}
                  >
                    <Icon name="chevron-up" size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(status, 1)}
                    disabled={index === statuses.length - 1}
                    aria-label={`Move ${status.label} down`}
                    title="Move down"
                    className={reorderButton}
                  >
                    <Icon name="chevron-down" size={14} />
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaletteFor(paletteFor === status.id ? null : status.id)}
                    aria-label={`Change colour for ${status.label}`}
                    title="Change colour"
                    className={cn("size-5 shrink-0 rounded-pill border border-line", STATUS_DOT[status.colour])}
                  />

                  {editingId === status.id ? (
                    <>
                      <input
                        value={draftLabel}
                        onChange={(e) => setDraftLabel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveRename(status);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        aria-label={`Rename ${status.label}`}
                        autoFocus
                        className="min-h-10 min-w-0 flex-1 rounded-[var(--sz-admin-radius-control)] border border-line bg-raised px-2.5 text-[13px] text-body outline-none focus-visible:border-primary-700"
                      />
                      <button
                        type="button"
                        onClick={() => saveRename(status)}
                        className="min-h-10 shrink-0 rounded-[7px] bg-primary-700 px-3 text-[11.5px] font-semibold text-white"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="min-h-10 shrink-0 px-1.5 text-[11.5px] font-semibold text-muted"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-[13px] font-semibold text-heading">{status.label}</span>
                          {status.isDefault && <Pill tone="gold">Default</Pill>}
                          {status.isSystem && <Pill tone="muted">System</Pill>}
                        </span>
                        <span className="font-mono text-[10px] text-muted">
                          {status.customerVisible ? "On the customer timeline" : "Hidden from customers"} ·{" "}
                          {status.orderCount} order{status.orderCount === 1 ? "" : "s"}
                        </span>
                      </span>

                      <Switch
                        checked={status.customerVisible}
                        onChange={(v) => run(() => updateStatusAction(status.id, { customerVisible: v }))}
                        label={`Show ${status.label} on the customer timeline`}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(status.id);
                          setDraftLabel(status.label);
                        }}
                        aria-label={`Rename ${status.label}`}
                        title="Rename"
                        className="inline-flex size-9 shrink-0 items-center justify-center rounded-[7px] text-muted hover:bg-surface"
                      >
                        <Icon name="wrench" size={15} />
                      </button>
                      {!status.isSystem && !status.isDefault && (
                        <button
                          type="button"
                          onClick={() => {
                            setDeleting(status);
                            setReassignTo(statuses.find((s) => s.id !== status.id)?.key ?? "");
                          }}
                          aria-label={`Delete ${status.label}`}
                          title="Delete status"
                          className="inline-flex size-9 shrink-0 items-center justify-center rounded-[7px] text-error hover:bg-error-soft"
                        >
                          <Icon name="trash" size={15} />
                        </button>
                      )}
                    </>
                  )}
                </div>

                {paletteFor === status.id && (
                  <div className="flex flex-wrap items-center gap-1.5 px-2.5 pb-2.5 pl-11">
                    {STATUS_COLOURS.map((colour) => (
                      <button
                        key={colour}
                        type="button"
                        onClick={() => {
                          setPaletteFor(null);
                          run(() => updateStatusAction(status.id, { colour }));
                        }}
                        aria-label={`${colour} for ${status.label}`}
                        aria-pressed={status.colour === colour}
                        className={cn(
                          "size-5 rounded-pill border border-line",
                          STATUS_DOT[colour],
                          status.colour === colour && "outline outline-2 outline-offset-2 outline-primary-700",
                        )}
                      />
                    ))}
                    {!status.isDefault && (
                      <button
                        type="button"
                        onClick={() => {
                          setPaletteFor(null);
                          run(() => setDefaultStatusAction(status.id), `${status.label} is now the default.`);
                        }}
                        className="ml-auto min-h-9 px-1 text-[11px] font-semibold text-primary-700"
                      >
                        Make default
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>

          <div className="mt-3.5 border-t border-line-soft pt-3.5">
            <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-accent-strong">
              Add a custom status
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setNewColour(STATUS_COLOURS[(STATUS_COLOURS.indexOf(newColour) + 1) % STATUS_COLOURS.length])
                }
                aria-label={`Colour: ${newColour}. Click to change.`}
                title="Change colour"
                className={cn("size-6 shrink-0 rounded-pill border border-line", STATUS_DOT[newColour])}
              />
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newLabel.trim()) {
                    run(() => createStatusAction(newLabel, newColour), "Status added.");
                    setNewLabel("");
                  }
                }}
                aria-label="New status name"
                placeholder="e.g. Awaiting stone setting"
                className="min-h-11 flex-[1_1_160px] rounded-[var(--sz-admin-radius-control)] border border-line bg-admin-canvas px-2.5 text-[13px] text-body outline-none placeholder:text-muted focus-visible:border-primary-700"
              />
              <button
                type="button"
                disabled={!newLabel.trim() || busy}
                onClick={() => {
                  run(() => createStatusAction(newLabel, newColour), "Status added.");
                  setNewLabel("");
                }}
                className="min-h-11 shrink-0 rounded-[var(--sz-admin-radius-control)] bg-primary-700 px-4 text-[12.5px] font-semibold text-white hover:bg-primary-800 disabled:opacity-50"
              >
                Add
              </button>
            </div>
            <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
              Custom statuses can be renamed, recoloured and deleted. System statuses keep the platform working — their
              label and colour are yours, but they can&rsquo;t be removed.
            </p>
          </div>
        </div>
      </aside>

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete “${deleting?.label ?? ""}”?`}
        tone="danger"
        confirmLabel="Delete status"
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const target = deleting;
          setDeleting(null);
          if (target) run(() => deleteStatusAction(target.id, reassignTo), "Status deleted.");
        }}
        body={
          deleting && (
            <>
              {deleting.orderCount > 0 ? (
                <>
                  <p>
                    <strong className="text-body">{deleting.orderCount}</strong> order
                    {deleting.orderCount === 1 ? " is" : "s are"} on this status and must move somewhere first.
                  </p>
                  <label className="mt-3 block">
                    <span className="mb-1 block text-xs font-semibold text-body">Move those orders to</span>
                    <select
                      value={reassignTo}
                      onChange={(e) => setReassignTo(e.target.value)}
                      className="min-h-11 w-full rounded-[var(--sz-admin-radius-control)] border border-line bg-admin-canvas px-2.5 text-[13px] text-body"
                    >
                      {deleteTargets.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : (
                <>No orders are on this status, so nothing moves.</>
              )}
            </>
          )
        }
      />
    </>
  );
}

/** Deliberately 32px rather than the 44px the rest of the admin uses for touch:
 *  this drawer is 452px wide (375px on a phone) and already carries a switch,
 *  rename and delete on the same line, so the pair is sized to the drawer's own
 *  controls instead of pushing the label out of it. */
const reorderButton =
  "inline-flex size-8 shrink-0 items-center justify-center rounded text-muted hover:bg-surface disabled:opacity-30 disabled:hover:bg-transparent";

function Pill({ tone, children }: { tone: "gold" | "muted"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-pill px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.06em]",
        tone === "gold" ? "bg-warning-soft text-[var(--sz-admin-gold-ink)]" : "bg-surface text-muted",
      )}
    >
      {children}
    </span>
  );
}
