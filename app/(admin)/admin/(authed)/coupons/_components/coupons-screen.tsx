"use client";

import { useMemo, useState, useTransition } from "react";
import { Icon, useDialog, useToast } from "@/components/ui";
import { Chip, type ChipTone } from "@/components/admin/chip";
import { Switch } from "@/components/admin/switch";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import {
  StackedBody,
  StackedCell,
  StackedHead,
  StackedRow,
  StackedTable,
  StackedTh,
} from "@/components/admin/stacked-table";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import {
  STATUS_LABEL,
  blankDraft,
  couponStatus,
  describeCoupon,
  discountLabel,
  draftFromRow,
  expiryInstant,
  generateCode,
  startInstant,
  validateDraft,
  type CouponDraft,
  type CouponStatus,
} from "@/lib/admin/coupon-rules";
import type { AdminCouponRow } from "@/lib/admin/coupons";
import {
  deleteCouponAction,
  saveCouponAction,
  setCouponActiveAction,
  type CouponsResult,
} from "../_actions";
import { CouponUsagePanel } from "./coupon-usage";

/**
 * Coupons — Sazuna Admin Coupons.dc.html.
 *
 * The only screen in this admin where a staffer changes what a customer is
 * charged, so two things are deliberate.
 *
 * **The summary sentence at the top of the drawer.** Eight nullable columns
 * interact in ways nobody holds in their head — a percentage with a cap and a
 * minimum reads very differently from what people expect — so the coupon states
 * itself in one line, computed by the same arithmetic the checkout runs, before
 * it can be saved.
 *
 * **No free-shipping toggle.** The spec has one, and the column exists. But this
 * shop charges no shipping to waive, and nothing in the codebase reads the flag,
 * so the switch would save, report success, and change no total anywhere. The
 * column is left exactly as it is found on rows that already set it.
 *
 * Searching and filtering are client-side: the whole table is a few dozen rows,
 * and a round trip per keystroke would be slower and worse.
 */

type Editing = {
  id: number | null;
  draft: CouponDraft;
  /** Errors show once something has been typed, or once Save has been pressed —
   *  a form that turns red before it has been touched is just shouting. */
  touched: boolean;
  showErrors: boolean;
};

type TypeFilter = "" | "percent" | "fixed";

const STATUS_TONE: Record<CouponStatus, ChipTone> = {
  active: "success",
  scheduled: "warning",
  expired: "neutral",
  inactive: "error",
};

/** The pill, from the same rule the checkout applies. Module-level so the memos
 *  that call it can declare honest dependencies. */
function statusOf(row: AdminCouponRow, clock: Date): CouponStatus {
  return couponStatus(
    { isActive: row.isActive, startsAt: startInstant(row.startsOn), expiresAt: expiryInstant(row.expiresOn) },
    clock,
  );
}

export function CouponsScreen({ initial, nowIso }: { initial: AdminCouponRow[]; nowIso: string }) {
  const { toast } = useToast();
  const [rows, setRows] = useState(initial);
  const [now, setNow] = useState(nowIso);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminCouponRow | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [busy, startTransition] = useTransition();

  const { ref: drawerRef, onBackdropClick } = useDialog(editing !== null, () => tryClose());

  const clock = useMemo(() => new Date(now), [now]);

  function handle(result: CouponsResult, ok?: string) {
    if (result.ok) {
      setRows(result.rows);
      setNow(result.nowIso);
      if (ok) toast("success", ok);
    } else {
      toast("error", result.error);
    }
    return result.ok;
  }

  /* --- list -------------------------------------------------------------- */

  const counts = useMemo(() => {
    const tally = { active: 0, scheduled: 0 };
    for (const row of rows) {
      const status = statusOf(row, clock);
      if (status === "active") tally.active += 1;
      if (status === "scheduled") tally.scheduled += 1;
    }
    return tally;
  }, [rows, clock]);

  const visible = useMemo(() => {
    const term = query.trim().toUpperCase();
    return rows.filter((row) => {
      if (term && !row.code.toUpperCase().includes(term)) return false;
      if (typeFilter && row.discountType !== typeFilter) return false;
      return true;
    });
  }, [rows, query, typeFilter]);

  /* --- drawer ------------------------------------------------------------ */

  const takenCodes = useMemo(
    () => rows.filter((row) => row.id !== editing?.id).map((row) => row.code),
    [rows, editing?.id],
  );

  const errors = editing ? validateDraft(editing.draft, takenCodes) : {};
  const showErrors = Boolean(editing && (editing.touched || editing.showErrors));

  const setDraft = (patch: Partial<CouponDraft>) =>
    setEditing((current) =>
      current ? { ...current, draft: { ...current.draft, ...patch }, touched: true } : current,
    );

  function openCreate() {
    setEditing({ id: null, draft: blankDraft(), touched: false, showErrors: false });
  }

  function openEdit(row: AdminCouponRow) {
    setEditing({ id: row.id, draft: draftFromRow(row), touched: false, showErrors: false });
  }

  /** Closing a half-written coupon asks first; closing an untouched one just
   *  closes. `useDialog` routes Escape and the backdrop through here too. */
  function tryClose() {
    if (editing?.touched) {
      setConfirmDiscard(true);
      return;
    }
    setEditing(null);
  }

  function save() {
    if (!editing || busy) return;
    if (Object.keys(errors).length > 0) {
      setEditing({ ...editing, showErrors: true });
      return;
    }
    const isNew = editing.id === null;
    const code = editing.draft.code.trim().toUpperCase();
    startTransition(async () => {
      const result = await saveCouponAction(editing.id, editing.draft);
      if (handle(result, `${code} ${isNew ? "created" : "saved"}.`)) setEditing(null);
    });
  }

  function toggleActive(row: AdminCouponRow) {
    startTransition(async () => {
      handle(
        await setCouponActiveAction(row.id, !row.isActive),
        `${row.code} ${row.isActive ? "switched off" : "switched on"}.`,
      );
    });
  }

  function removeCoupon(row: AdminCouponRow) {
    startTransition(async () => {
      if (handle(await deleteCouponAction(row.id), `${row.code} deleted.`)) setConfirmDelete(null);
    });
  }

  function deactivateInstead(row: AdminCouponRow) {
    startTransition(async () => {
      if (handle(await setCouponActiveAction(row.id, false), `${row.code} switched off — history kept.`)) {
        setConfirmDelete(null);
      }
    });
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      toast("success", `${code} copied.`);
    } catch {
      // Clipboard access can be refused outright; the code is on screen anyway.
      toast("error", "Couldn't copy — select the code and copy it by hand.");
    }
  }

  const isPercent = editing?.draft.discountType === "percent";
  const editingRow = editing?.id != null ? rows.find((row) => row.id === editing.id) : undefined;

  return (
    <div className="mx-auto max-w-[900px]">
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-medium text-heading">Coupons</h2>
          <p className="mt-1 text-[12.5px] text-muted">
            {rows.length === 0
              ? "Discount codes customers enter at checkout."
              : `${rows.length.toLocaleString("en-IN")} ${rows.length === 1 ? "coupon" : "coupons"} · ${counts.active} active${counts.scheduled ? ` · ${counts.scheduled} scheduled` : ""}`}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="ml-auto inline-flex min-h-10 shrink-0 items-center gap-2 rounded-[var(--sz-admin-radius-control)] bg-primary-700 px-4 text-[13px] font-semibold text-white hover:bg-primary-800"
        >
          <Icon name="plus" size={16} strokeWidth={2} /> Create coupon
        </button>
      </div>

      {rows.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          <div className="relative min-w-[220px] flex-1 sm:max-w-[380px]">
            <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
              <Icon name="search" size={15} />
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value.toUpperCase())}
              aria-label="Search coupons by code"
              placeholder="Search code"
              className={cn(fieldClass, "pl-9 pr-9 font-mono uppercase")}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-1 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:text-primary-700"
              >
                <Icon name="close" size={15} />
              </button>
            )}
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            aria-label="Filter by discount type"
            className={cn(fieldClass, "w-auto min-w-[168px] flex-none font-semibold")}
          >
            <option value="">Any discount type</option>
            <option value="percent">Percent off</option>
            <option value="fixed">Fixed amount off</option>
          </select>
          {typeFilter && (
            <button
              type="button"
              onClick={() => setTypeFilter("")}
              className="min-h-10 shrink-0 px-1 text-xs font-semibold text-primary-700 underline"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-[var(--sz-admin-radius-card)] border border-line bg-raised px-4 py-10 text-center">
          <span className="inline-flex size-12 items-center justify-center rounded-pill bg-warning-soft text-[var(--sz-admin-gold-ink)]">
            <Icon name="pricetag" size={22} />
          </span>
          <p className="mx-auto mt-3 max-w-[44ch] text-[13px] leading-relaxed text-muted">
            No coupons yet. A coupon takes an amount or a percentage off the cart, and customers enter the code at
            checkout.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-4 inline-flex min-h-11 items-center rounded-[var(--sz-admin-radius-control)] bg-primary-700 px-5 text-[13px] font-semibold text-white hover:bg-primary-800"
          >
            Create your first coupon
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-[var(--sz-admin-radius-card)] border border-line bg-raised px-4 py-10 text-center">
          <p className="text-[13px] text-muted">
            {query ? `No coupon code contains “${query}”.` : "No coupon matches that discount type."}
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setTypeFilter("");
            }}
            className="mt-3 inline-flex min-h-11 items-center rounded-[var(--sz-admin-radius-control)] border border-line px-4 text-[13px] font-semibold text-body hover:border-primary-700"
          >
            Clear search and filter
          </button>
        </div>
      ) : (
        <>
          <StackedTable label="Coupons" tableClassName="min-[761px]:min-w-[720px]">
            <StackedHead>
              <StackedTh>Code</StackedTh>
              <StackedTh>Discount</StackedTh>
              <StackedTh>Min subtotal</StackedTh>
              <StackedTh>Status</StackedTh>
              <StackedTh>Live</StackedTh>
              <StackedTh className="w-[104px]" />
            </StackedHead>
            <StackedBody>
              {visible.map((row) => {
                const status = statusOf(row, clock);
                return (
                  <StackedRow key={row.id}>
                    <StackedCell label="Code">
                      <span className="flex items-center justify-end gap-1 min-[761px]:justify-start">
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          aria-label={`Edit coupon ${row.code}`}
                          className={cn(
                            "truncate font-mono text-[12.5px] font-semibold",
                            status === "active" || status === "scheduled" ? "text-primary-700" : "text-muted",
                          )}
                        >
                          {row.code}
                        </button>
                        <button
                          type="button"
                          onClick={() => copyCode(row.code)}
                          aria-label={`Copy code ${row.code}`}
                          title="Copy code"
                          className={cn(rowAction, "size-7 max-[760px]:size-9")}
                        >
                          <Icon name="copy" size={13} />
                        </button>
                      </span>
                    </StackedCell>
                    <StackedCell label="Discount" className="font-mono text-heading">
                      {discountLabel(draftFromRow(row))}
                    </StackedCell>
                    <StackedCell label="Min subtotal" className="font-mono">
                      {Number(row.minSubtotal) > 0 ? (formatPrice(row.minSubtotal) ?? "—") : <span className="text-muted">—</span>}
                    </StackedCell>
                    <StackedCell label="Status">
                      <Chip tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Chip>
                    </StackedCell>
                    <StackedCell label="Live">
                      <Switch
                        checked={row.isActive}
                        onChange={() => toggleActive(row)}
                        disabled={busy}
                        label={`Switch ${row.code} ${row.isActive ? "off" : "on"}`}
                      />
                    </StackedCell>
                    <StackedCell label="">
                      <span className="flex items-center justify-end gap-0.5">
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          aria-label={`Edit ${row.code}`}
                          title="Edit"
                          className={rowAction}
                        >
                          <Icon name="wrench" size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(row)}
                          aria-label={`Delete ${row.code}`}
                          title="Delete"
                          className={cn(rowAction, "hover:bg-error-soft hover:text-error")}
                        >
                          <Icon name="trash" size={15} />
                        </button>
                      </span>
                    </StackedCell>
                  </StackedRow>
                );
              })}
            </StackedBody>
          </StackedTable>
          <p className="mt-2 font-mono text-[11px] text-muted">
            Showing {visible.length} of {rows.length} coupons
          </p>
        </>
      )}

      {/* Native modal <dialog>: Escape, the focus trap, the backdrop and focus
          restore all come from the platform. Kept mounted and driven by `open`,
          because a dialog unmounted while open never hands focus back. */}
      {/*
        Escape has to be stopped, not just observed. `useDialog` reports the
        native `cancel` back to React but never prevents its default, so without
        this the key both closes the drawer AND opens the discard dialog — the
        edits are already gone by the time it asks whether to throw them away.
        Prevented only when there is something to lose; an untouched drawer
        closes on Escape the way every other drawer in this admin does.
      */}
      <dialog
        ref={drawerRef}
        onClick={onBackdropClick}
        onCancel={(event) => {
          if (editing?.touched) event.preventDefault();
        }}
        aria-label={editing?.id ? "Edit coupon" : "Create coupon"}
        className={drawerClass}
      >
        {editing && (
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 border-b border-line px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-md font-medium text-heading">
                  {editing.id ? "Edit coupon" : "Create coupon"}
                </h3>
                <p className="mt-0.5 text-[11.5px] text-muted">
                  {editing.id ? "Changes apply to new checkouts right away." : "A code customers type at checkout."}
                </p>
              </div>
              <button
                type="button"
                onClick={tryClose}
                aria-label="Close"
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-[7px] text-muted hover:bg-admin-canvas"
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3.5">
              {/* What this coupon does, in one line, computed by the arithmetic
                  the checkout runs. */}
              <div role="status" aria-live="polite" className="rounded-xl border border-accent-soft bg-warning-soft px-3.5 py-3">
                <span className="mb-1 block font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--sz-admin-gold-ink)]">
                  In plain words
                </span>
                <p className="text-[12.5px] leading-relaxed text-body">{describeCoupon(editing.draft)}</p>
              </div>

              <div className="mt-4">
                <label htmlFor="cp-code" className={labelClass}>Code</label>
                <div className="flex gap-2">
                  <input
                    id="cp-code"
                    value={editing.draft.code}
                    onChange={(e) => setDraft({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "") })}
                    placeholder="SAZUNA10"
                    aria-invalid={showErrors && Boolean(errors.code)}
                    aria-describedby="cp-code-note"
                    className={cn(fieldClass, "font-mono font-semibold uppercase", showErrors && errors.code && "border-error")}
                  />
                  <button
                    type="button"
                    onClick={() => setDraft({ code: generateCode(rows.map((r) => r.code)) })}
                    className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-[var(--sz-admin-radius-control)] border border-line px-3 text-[12.5px] font-semibold text-primary-700 hover:border-primary-700"
                  >
                    <Icon name="refresh" size={14} /> Generate
                  </button>
                </div>
                <p id="cp-code-note" className={cn("mt-1 text-[11px] leading-relaxed", showErrors && errors.code ? "text-error" : "text-muted")}>
                  {showErrors && errors.code
                    ? errors.code
                    : "Uppercase letters, numbers and dashes. Customers type this at checkout."}
                </p>
              </div>

              <div className="mt-4 border-t border-line pt-4">
                <p className={sectionLabel}>Discount</p>
                <div className="mt-2 flex gap-1 rounded-[var(--sz-admin-radius-control)] border border-line bg-admin-canvas p-1" role="radiogroup" aria-label="Discount type">
                  {(["percent", "fixed"] as const).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      role="radio"
                      aria-checked={editing.draft.discountType === kind}
                      // Switching to a fixed amount clears the cap: it applies
                      // only to percentages, and a stale one left behind would
                      // shrink the amount without appearing anywhere.
                      onClick={() => setDraft(kind === "fixed" ? { discountType: kind, maxDiscount: "" } : { discountType: kind })}
                      className={cn(
                        "min-h-9 flex-1 rounded-[7px] text-[12.5px] font-semibold",
                        editing.draft.discountType === kind ? "bg-raised text-heading shadow-[var(--sz-shadow-card)]" : "text-muted hover:text-body",
                      )}
                    >
                      {kind === "percent" ? "Percent" : "Fixed amount"}
                    </button>
                  ))}
                </div>

                <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
                  <div>
                    <label htmlFor="cp-value" className={labelClass}>{isPercent ? "Percent off" : "Amount off"}</label>
                    <div className="relative">
                      {!isPercent && <span aria-hidden="true" className={unitLeft}>रु</span>}
                      <input
                        id="cp-value"
                        value={editing.draft.discountValue}
                        // A percentage may carry two decimals, which is all the
                        // column keeps; a fixed amount is whole rupees, because
                        // every figure this shop displays is rounded to one.
                        onChange={(e) => setDraft({ discountValue: isPercent ? decimalInput(e.target.value) : e.target.value.replace(/[^0-9]/g, "") })}
                        inputMode={isPercent ? "decimal" : "numeric"}
                        placeholder="0"
                        aria-invalid={showErrors && Boolean(errors.value)}
                        className={cn(fieldClass, "font-mono", isPercent ? "pr-8" : "pl-8", showErrors && errors.value && "border-error")}
                      />
                      {isPercent && <span aria-hidden="true" className={unitRight}>%</span>}
                    </div>
                  </div>
                  {isPercent && (
                    <div>
                      <label htmlFor="cp-cap" className={labelClass}>Max discount</label>
                      <div className="relative">
                        <span aria-hidden="true" className={unitLeft}>रु</span>
                        <input
                          id="cp-cap"
                          value={editing.draft.maxDiscount}
                          onChange={(e) => setDraft({ maxDiscount: e.target.value.replace(/[^0-9]/g, "") })}
                          inputMode="numeric"
                          placeholder="No cap"
                          aria-invalid={showErrors && Boolean(errors.maxDiscount)}
                          className={cn(fieldClass, "pl-8 font-mono", showErrors && errors.maxDiscount && "border-error")}
                        />
                      </div>
                    </div>
                  )}
                </div>
                {showErrors && (errors.value || errors.maxDiscount) && (
                  <p role="alert" className="mt-1.5 text-[11px] text-error">{errors.value ?? errors.maxDiscount}</p>
                )}
                {isPercent && (
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                    The cap limits the discount however large the cart. Leave it blank for no cap.
                  </p>
                )}
              </div>

              <div className="mt-4 border-t border-line pt-4">
                <p className={sectionLabel}>Conditions</p>
                <div className="mt-2">
                  <label htmlFor="cp-min" className={labelClass}>Minimum cart subtotal</label>
                  <div className="relative">
                    <span aria-hidden="true" className={unitLeft}>रु</span>
                    <input
                      id="cp-min"
                      value={editing.draft.minSubtotal}
                      onChange={(e) => setDraft({ minSubtotal: e.target.value.replace(/[^0-9]/g, "") })}
                      inputMode="numeric"
                      placeholder="No minimum"
                      className={cn(fieldClass, "pl-8 font-mono")}
                    />
                  </div>
                </div>
                <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
                  <div>
                    <label htmlFor="cp-uses" className={labelClass}>Total usage limit</label>
                    <input
                      id="cp-uses"
                      value={editing.draft.maxUses}
                      onChange={(e) => setDraft({ maxUses: e.target.value.replace(/[^0-9]/g, "") })}
                      inputMode="numeric"
                      placeholder="Unlimited"
                      className={cn(fieldClass, "font-mono", showErrors && errors.limits && "border-error")}
                    />
                  </div>
                  <div>
                    <label htmlFor="cp-per" className={labelClass}>Per customer</label>
                    <input
                      id="cp-per"
                      value={editing.draft.perCustomerLimit}
                      onChange={(e) => setDraft({ perCustomerLimit: e.target.value.replace(/[^0-9]/g, "") })}
                      inputMode="numeric"
                      placeholder="Unlimited"
                      className={cn(fieldClass, "font-mono", showErrors && errors.limits && "border-error")}
                    />
                  </div>
                </div>
                <p className={cn("mt-1.5 text-[11px] leading-relaxed", showErrors && errors.limits ? "text-error" : "text-muted")}>
                  {showErrors && errors.limits
                    ? errors.limits
                    : "Blank means unlimited. Per customer counts redemptions from the same phone number."}
                </p>
              </div>

              <div className="mt-4 border-t border-line pt-4">
                <p className={sectionLabel}>Validity</p>
                <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
                  <div>
                    <label htmlFor="cp-start" className={labelClass}>Starts</label>
                    <input
                      id="cp-start"
                      type="date"
                      value={editing.draft.startsOn}
                      onChange={(e) => setDraft({ startsOn: e.target.value })}
                      aria-invalid={showErrors && Boolean(errors.dates)}
                      className={cn(fieldClass, "font-mono", showErrors && errors.dates && "border-error")}
                    />
                  </div>
                  <div>
                    <label htmlFor="cp-expiry" className={labelClass}>Expires</label>
                    <input
                      id="cp-expiry"
                      type="date"
                      value={editing.draft.expiresOn}
                      onChange={(e) => setDraft({ expiresOn: e.target.value })}
                      aria-invalid={showErrors && Boolean(errors.dates)}
                      className={cn(fieldClass, "font-mono", showErrors && errors.dates && "border-error")}
                    />
                  </div>
                </div>
                <p className={cn("mt-1.5 text-[11px] leading-relaxed", showErrors && errors.dates ? "text-error" : "text-muted")}>
                  {showErrors && errors.dates
                    ? errors.dates
                    : "Both days count in full, Nepal time. Leave either side blank for no bound."}
                </p>
              </div>

              <div className="mt-4 flex items-center gap-3 border-t border-line pt-4">
                <div className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-semibold text-heading">Active</span>
                  <span className="mt-0.5 block text-[11.5px] leading-relaxed text-muted">
                    {editing.draft.isActive
                      ? "Customers can redeem it inside its validity window."
                      : "Saved but not redeemable — nothing goes live until you switch it on."}
                  </span>
                </div>
                <Switch
                  checked={editing.draft.isActive}
                  onChange={(next) => setDraft({ isActive: next })}
                  label="Coupon active"
                />
              </div>

              {editing.id != null && editingRow && (
                <CouponUsagePanel
                  key={editing.id}
                  couponId={editing.id}
                  code={editingRow.code}
                  maxUses={editingRow.maxUses}
                  gateCount={editingRow.usedCount}
                  onCorrected={(result) => handle(result, "Counter corrected.")}
                />
              )}
            </div>

            <div className="flex gap-2.5 border-t border-line px-4 py-3.5">
              <button
                type="button"
                onClick={tryClose}
                disabled={busy}
                className="min-h-11 flex-none rounded-[var(--sz-admin-radius-control)] border border-line px-4 text-[13px] font-semibold text-body hover:border-primary-700 disabled:opacity-[var(--sz-disabled-opacity)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={busy}
                aria-busy={busy || undefined}
                className="min-h-11 flex-1 rounded-[var(--sz-admin-radius-control)] bg-primary-700 text-[13px] font-semibold text-white hover:bg-primary-800 disabled:cursor-progress disabled:opacity-[var(--sz-disabled-opacity)]"
              >
                {busy ? "Saving…" : editing.id ? "Save coupon" : "Create coupon"}
              </button>
            </div>
          </div>
        )}
      </dialog>

      {/* Deleting is not the same as stopping. `orders.coupon_code` is a plain
          string with no foreign key, so a delete quietly detaches every order
          that used the code — which is why the reversible option is offered
          right beside it whenever there is history to lose. */}
      <ConfirmDialog
        open={confirmDelete !== null}
        tone="danger"
        title={`Delete ${confirmDelete?.code ?? "coupon"}?`}
        body={
          <>
            <p>The code stops working at checkout immediately and disappears from this list.</p>
            {/* Counted from every order carrying the code, not just the ones
                that redeemed it: a cancelled order's link breaks the same way. */}
            {confirmDelete && confirmDelete.linkedOrders > 0 && (
              <p className="mt-2 rounded-lg border border-accent-soft bg-warning-soft px-3 py-2.5 text-[12.5px] leading-relaxed text-[var(--sz-admin-gold-ink)]">
                {confirmDelete.linkedOrders.toLocaleString("en-IN")}{" "}
                {confirmDelete.linkedOrders === 1 ? "order carries" : "orders carry"} this code. Deleting it drops that
                link from your order history — switching it off keeps the record and still stops new redemptions.
              </p>
            )}
          </>
        }
        confirmLabel="Delete coupon"
        cancelLabel="Keep it"
        altLabel={confirmDelete && confirmDelete.linkedOrders > 0 && confirmDelete.isActive ? "Switch it off instead" : undefined}
        onAlt={confirmDelete ? () => deactivateInstead(confirmDelete) : undefined}
        busy={busy}
        onConfirm={() => confirmDelete && removeCoupon(confirmDelete)}
        onCancel={() => !busy && setConfirmDelete(null)}
      />

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard changes?"
        body="Your edits to this coupon haven't been saved yet."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onConfirm={() => {
          setConfirmDiscard(false);
          setEditing(null);
        }}
        onCancel={() => setConfirmDiscard(false)}
      />
    </div>
  );
}

/**
 * Digits and at most one point, with at most two figures after it.
 *
 * A bare `[^0-9.]` strip lets "1.2.3" through, which `Number` reads as NaN — and
 * the field then reports "set a percentage above 0", which is not the problem
 * the person has.
 */
function decimalInput(value: string): string {
  const cleaned = value.replace(/[^0-9.]/g, "");
  const [whole, ...rest] = cleaned.split(".");
  if (rest.length === 0) return whole;
  return `${whole}.${rest.join("").slice(0, 2)}`;
}

const fieldClass =
  "min-h-10 w-full rounded-[var(--sz-admin-radius-control)] border border-line bg-admin-canvas px-2.5 text-[13px] text-body outline-none placeholder:text-muted focus-visible:border-primary-700";

const labelClass = "mb-1 block text-xs font-semibold text-body";

/** The spec's `.adx-lbl2` step eyebrow above each section of the drawer. */
const sectionLabel = "font-mono text-[10px] uppercase tracking-[0.12em] text-accent-strong";

/** 32px on desktop, 44px below 760 — the spec's own touch-target bump. */
const rowAction =
  "inline-flex size-8 max-[760px]:size-11 shrink-0 items-center justify-center rounded-[7px] text-muted hover:bg-admin-canvas hover:text-body disabled:opacity-30";

const unitLeft =
  "pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-[12px] text-muted";
const unitRight =
  "pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[12px] text-muted";

const drawerClass =
  "m-0 ml-auto h-dvh max-h-none w-[min(452px,100vw)] max-w-none border-l border-line bg-raised p-0 text-body shadow-[var(--sz-shadow-drawer)] backdrop:bg-[var(--sz-overlay)]";
