"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Icon, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
// `lib/order-lookup` is pure — no `server-only`, no I/O — so the browser can
// share the storefront's own idea of what a phone number is. The confirm dialog
// therefore shows the digits that will actually be stored, not what was typed.
import { normalisePhone } from "@/lib/order-lookup";
import type {
  AdminCustomerFilters,
  AdminCustomerPage,
  AdminCustomerRow,
  CustomerDetail,
  CustomerProfileInput,
} from "@/lib/admin/customers";
// The one place a status colour token becomes CSS. Imported rather than
// re-declared so a status looks the same here as it does on the orders list.
import { STATUS_CHIP } from "../../orders/_components/status-badge";
import {
  loadCustomersAction,
  loadCustomerAction,
  saveCustomerProfileAction,
  changeCustomerPhoneAction,
  type CustomersResult,
} from "../_actions";

/**
 * Customers — the CRM list and the profile drawer.
 *
 * There is no design spec for this screen, so it is built from the patterns the
 * rest of the admin already established: the orders list's search / sort /
 * pagination, the collections drawer's 452px `aside`, and the order detail's
 * in-place section editing.
 *
 * `phone` is editable, but never as a field. It is the row's identity — the
 * UNIQUE key the order desk looks a walk-in up by, and the handle the storefront
 * sends an OTP to — so it is moved by a named action behind a confirm that says
 * what moving it costs, not by an input that saves on blur beside the city.
 */

/** Which sort keys a column header cycles through, first click first. */
const COLUMN_SORTS = {
  name: ["name_asc", "name_desc"],
  orders: ["orders_desc", "orders_asc"],
  spend: ["spend_desc", "spend_asc"],
  joined: ["joined_desc", "joined_asc"],
} as const;

type SortableColumn = keyof typeof COLUMN_SORTS;

export function CustomersScreen({ initialPage }: { initialPage: AdminCustomerPage }) {
  const { toast } = useToast();
  const [page, setPage] = useState(initialPage);
  const [filters, setFilters] = useState<AdminCustomerFilters>({});
  const [search, setSearch] = useState("");
  // `selectedId` is tracked separately from `detail` so the drawer can be keyed
  // on it. Two customers created by the same import can share an `updatedAt`,
  // and keying on the id is what guarantees the editors re-seed when the
  // profile behind them changes.
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [busy, startTransition] = useTransition();

  function handle(result: CustomersResult) {
    if (result.ok) setPage(result.page);
    else toast("error", result.error);
  }

  /** Every list change goes through here, so the filters the server sees and
   *  the ones the UI shows can never drift apart. */
  function apply(next: AdminCustomerFilters) {
    setFilters(next);
    startTransition(async () => handle(await loadCustomersAction(next)));
  }

  function open(row: AdminCustomerRow) {
    setSelectedId(row.id);
    setLoadingDetail(true);
    setDetail(null);
    startTransition(async () => {
      const result = await loadCustomerAction(row.id);
      setLoadingDetail(false);
      if (result.ok) setDetail(result.customer);
      else toast("error", result.error);
    });
  }

  function close() {
    setSelectedId(null);
    setDetail(null);
    setLoadingDetail(false);
  }

  const sort = filters.sort ?? "recent";

  function sortBy(column: SortableColumn) {
    const [first, second] = COLUMN_SORTS[column];
    apply({ ...filters, sort: sort === first ? second : first, page: 1 });
  }

  /** `aria-sort` for a header, so a screen reader gets the same information the
   *  chevron gives everyone else. */
  function ariaSort(column: SortableColumn): "ascending" | "descending" | "none" {
    const [first, second] = COLUMN_SORTS[column];
    if (sort === first || sort === second) return sort.endsWith("_asc") ? "ascending" : "descending";
    return "none";
  }

  return (
    <div className="mx-auto max-w-[1180px]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-medium text-heading">Customers</h2>
        <p className="font-mono text-[11px] text-muted">
          {page.total.toLocaleString("en-IN")} customer{page.total === 1 ? "" : "s"}
        </p>
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
            aria-label="Search customers by name, phone or email"
            placeholder="Name, phone or email"
            className="min-h-11 w-full rounded-[var(--sz-admin-radius-control)] border border-line bg-admin-canvas pl-9 pr-3 text-[13px] text-body outline-none placeholder:text-muted focus-visible:border-primary-700"
          />
        </div>
        <button
          type="button"
          onClick={() => apply({ ...filters, search, page: 1 })}
          disabled={busy}
          className="inline-flex min-h-11 items-center rounded-[var(--sz-admin-radius-control)] border border-line bg-raised px-3.5 text-[12.5px] font-semibold text-body hover:border-primary-700 disabled:opacity-40"
        >
          Search
        </button>
        {(filters.search || sort !== "recent") && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              apply({});
            }}
            className="inline-flex min-h-11 items-center rounded-[var(--sz-admin-radius-control)] px-2.5 text-[12.5px] font-semibold text-primary-700"
          >
            Reset
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-[var(--sz-admin-radius-card)] border border-line bg-raised">
        <table className="w-full min-w-[820px] text-[13px]">
          <thead>
            <tr className="border-b border-line-soft text-left text-xs text-muted">
              <SortHeader column="name" label="Name" ariaSort={ariaSort("name")} onSort={sortBy} />
              {/* Phone and email are identifiers, not orderings — a customer
                  list sorted by phone number answers no question anyone asks. */}
              <th className="px-3 py-2.5 font-medium">Phone</th>
              <th className="px-3 py-2.5 font-medium">Email</th>
              <SortHeader column="orders" label="Orders" ariaSort={ariaSort("orders")} onSort={sortBy} align="right" />
              <SortHeader column="spend" label="Lifetime spend" ariaSort={ariaSort("spend")} onSort={sortBy} align="right" />
              <SortHeader column="joined" label="Joined" ariaSort={ariaSort("joined")} onSort={sortBy} />
            </tr>
          </thead>
          <tbody>
            {page.rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-[13px] text-muted">
                  {filters.search ? "No customers match this search." : "No customers yet."}
                </td>
              </tr>
            ) : (
              page.rows.map((row) => (
                <CustomerTr key={row.id} row={row} active={selectedId === row.id} onOpen={() => open(row)} />
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[560px] text-[11px] text-muted">
          Lifetime spend counts every order except cancelled, failed and abandoned-checkout ones. The Orders column
          counts them all — open a customer to see which is which.
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
          <span className="inline-flex min-h-10 items-center font-mono text-[11px] text-muted">
            page {page.page} of {page.totalPages}
          </span>
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

      {selectedId !== null && (
        <ProfileDrawer
          key={selectedId}
          detail={detail}
          loading={loadingDetail}
          busy={busy}
          onClose={close}
          onSave={(patch, ok) => {
            if (!detail) return;
            startTransition(async () => {
              const result = await saveCustomerProfileAction(detail.id, patch, filters);
              if (result.ok) {
                setDetail(result.customer);
                setPage(result.page);
                toast("success", ok);
              } else {
                toast("error", result.error);
              }
            });
          }}
          // Resolves to whether it landed, so the dialog closes on success and
          // stays open — with what was typed still in it — on a collision.
          onChangePhone={async (phone) => {
            if (!detail) return false;
            const result = await changeCustomerPhoneAction(detail.id, phone, filters);
            if (!result.ok) {
              toast("error", result.error);
              return false;
            }
            setDetail(result.customer);
            setPage(result.page);
            toast(
              "success",
              result.change.sessionsRevoked > 0
                ? `Phone changed to ${result.change.to}. ${result.change.sessionsRevoked} session${
                    result.change.sessionsRevoked === 1 ? "" : "s"
                  } ended.`
                : `Phone changed to ${result.change.to}.`,
            );
            return true;
          }}
        />
      )}
    </div>
  );
}

/* --- list ------------------------------------------------------------------ */

function SortHeader({
  column,
  label,
  ariaSort,
  onSort,
  align,
}: {
  column: SortableColumn;
  label: string;
  ariaSort: "ascending" | "descending" | "none";
  onSort: (column: SortableColumn) => void;
  align?: "right";
}) {
  return (
    <th aria-sort={ariaSort} className={cn("px-3 py-2.5 font-medium", align === "right" && "text-right")}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "inline-flex min-h-8 items-center gap-1 text-xs font-medium hover:text-primary-700",
          ariaSort === "none" ? "text-muted" : "text-primary-700",
        )}
      >
        {label}
        {ariaSort !== "none" && <Icon name={ariaSort === "ascending" ? "chevron-up" : "chevron-down"} size={13} />}
      </button>
    </th>
  );
}

function CustomerTr({ row, active, onOpen }: { row: AdminCustomerRow; active: boolean; onOpen: () => void }) {
  return (
    <tr className={cn("border-b border-line-soft last:border-0", active && "bg-admin-canvas")}>
      <td className="px-3 py-2.5">
        <button
          type="button"
          onClick={onOpen}
          className="block max-w-[220px] truncate text-left text-[13px] font-semibold text-primary-700 underline underline-offset-2"
        >
          {row.name?.trim() || "Unnamed customer"}
        </button>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[12.5px] text-body">{row.phone}</td>
      <td className="px-3 py-2.5">
        <span className="block max-w-[220px] truncate text-muted">{row.email || "—"}</span>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-[12.5px] text-body">{row.orderCount}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-[13px] font-semibold text-heading">
        {money(row.lifetimeSpend)}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11.5px] text-muted">{shortDate(row.joinedAt)}</td>
    </tr>
  );
}

/* --- drawer ---------------------------------------------------------------- */

type ContactInput = Pick<
  CustomerProfileInput,
  "name" | "email" | "addressLine1" | "addressLine2" | "city" | "state" | "postalCode" | "country"
>;
type PersonalInput = Pick<CustomerProfileInput, "dob" | "anniversary" | "ringSize" | "bangleSize" | "notes">;

function ProfileDrawer({
  detail,
  loading,
  busy,
  onClose,
  onSave,
  onChangePhone,
}: {
  detail: CustomerDetail | null;
  loading: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (patch: Partial<CustomerProfileInput>, ok: string) => void;
  /** Resolves true when the change landed. */
  onChangePhone: (phone: string) => Promise<boolean>;
}) {
  const [editingContact, setEditingContact] = useState(false);
  const [contact, setContact] = useState<ContactInput>(() => toContact(detail));
  const [editingPersonal, setEditingPersonal] = useState(false);
  const [personal, setPersonal] = useState<PersonalInput>(() => toPersonal(detail));
  // The drawer is keyed on the customer id by its caller's render, but a save
  // returns a fresh detail into the same instance — so the editors re-seed from
  // whatever was stored, not from what the client hoped for.
  const [seeded, setSeeded] = useState(detail?.updatedAt ?? "");
  if (detail && detail.updatedAt !== seeded) {
    setSeeded(detail.updatedAt);
    setContact(toContact(detail));
    setPersonal(toPersonal(detail));
    setEditingContact(false);
    setEditingPersonal(false);
  }

  return (
    <>
      <button type="button" aria-label="Close" onClick={onClose} className="fixed inset-0 z-40 bg-[var(--sz-overlay)]" />
      <aside
        aria-label="Customer profile"
        className="fixed inset-y-0 right-0 z-50 flex w-[min(452px,100vw)] flex-col bg-raised shadow-[var(--sz-shadow-drawer)]"
      >
        <div className="flex items-start justify-between gap-2 border-b border-line px-4 py-3.5">
          <div className="min-w-0">
            <h3 className="truncate font-display text-md font-medium text-heading">
              {detail ? detail.name?.trim() || "Unnamed customer" : "Loading…"}
            </h3>
            {detail && <p className="font-mono text-[12px] text-muted">{detail.phone}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-[7px] text-muted hover:bg-admin-canvas"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {loading || !detail ? (
            <p className="text-[12.5px] text-muted">Loading profile…</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Stat label="Orders" value={String(detail.orderCount)} />
                <Stat label="Lifetime spend" value={money(detail.lifetimeSpend)} />
                <Stat label="Points" value={detail.loyaltyPoints.toLocaleString("en-IN")} />
              </div>

              {/* Phone is its own panel, not a row inside the contact editor:
                  it is the customer's identity and their OTP login handle, so it
                  moves by a named action behind a confirm rather than by a field
                  that saves alongside the postal code — and keeping it out here
                  means confirming it cannot discard an open address edit. */}
              <PhonePanel detail={detail} onChangePhone={onChangePhone} />

              <Section
                title="Contact & address"
                editing={editingContact}
                busy={busy}
                onEdit={() => setEditingContact(true)}
                onCancel={() => {
                  setContact(toContact(detail));
                  setEditingContact(false);
                }}
                onSave={() => {
                  setEditingContact(false);
                  onSave(contact, "Contact details saved.");
                }}
              >
                {editingContact ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Field label="Name" value={contact.name} onChange={(name) => setContact({ ...contact, name })} />
                    </div>
                    <div className="sm:col-span-2">
                      <Field
                        label="Email"
                        type="email"
                        value={contact.email}
                        onChange={(email) => setContact({ ...contact, email })}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Field
                        label="Address"
                        value={contact.addressLine1}
                        onChange={(addressLine1) => setContact({ ...contact, addressLine1 })}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Field
                        label="Area / landmark"
                        value={contact.addressLine2}
                        onChange={(addressLine2) => setContact({ ...contact, addressLine2 })}
                      />
                    </div>
                    <Field label="City" value={contact.city} onChange={(city) => setContact({ ...contact, city })} />
                    <Field label="State" value={contact.state} onChange={(state) => setContact({ ...contact, state })} />
                    <Field
                      label="Postal code"
                      mono
                      value={contact.postalCode}
                      onChange={(postalCode) => setContact({ ...contact, postalCode })}
                    />
                    <Field
                      label="Country"
                      value={contact.country}
                      onChange={(country) => setContact({ ...contact, country })}
                    />
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Readout label="Email" value={detail.email} />
                    <Readout label="City" value={detail.city} />
                    <div className="sm:col-span-2">
                      <Readout
                        label="Address"
                        value={
                          [detail.addressLine1, detail.addressLine2, detail.city, detail.state, detail.postalCode, detail.country]
                            .filter((part) => part && part.trim())
                            .join(", ") || null
                        }
                      />
                    </div>
                  </div>
                )}
              </Section>

              <Section
                title="Personal details"
                editing={editingPersonal}
                busy={busy}
                onEdit={() => setEditingPersonal(true)}
                onCancel={() => {
                  setPersonal(toPersonal(detail));
                  setEditingPersonal(false);
                }}
                onSave={() => {
                  setEditingPersonal(false);
                  onSave(personal, "Personal details saved.");
                }}
              >
                {editingPersonal ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field
                      label="Date of birth"
                      type="date"
                      value={personal.dob}
                      onChange={(dob) => setPersonal({ ...personal, dob })}
                    />
                    <Field
                      label="Anniversary"
                      type="date"
                      value={personal.anniversary}
                      onChange={(anniversary) => setPersonal({ ...personal, anniversary })}
                    />
                    <Field
                      label="Ring size"
                      value={personal.ringSize}
                      onChange={(ringSize) => setPersonal({ ...personal, ringSize })}
                    />
                    <Field
                      label="Bangle size"
                      value={personal.bangleSize}
                      onChange={(bangleSize) => setPersonal({ ...personal, bangleSize })}
                    />
                    <label className="block sm:col-span-2">
                      <span className={labelClass}>Notes</span>
                      <textarea
                        value={personal.notes}
                        onChange={(e) => setPersonal({ ...personal, notes: e.target.value })}
                        rows={3}
                        placeholder="Anything the counter should know"
                        className={cn(fieldClass, "resize-y py-2")}
                      />
                    </label>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Readout label="Date of birth" value={detail.dob} mono />
                    <Readout label="Anniversary" value={detail.anniversary} mono />
                    <Readout label="Ring size" value={detail.ringSize} />
                    <Readout label="Bangle size" value={detail.bangleSize} />
                    <div className="sm:col-span-2">
                      <Readout label="Notes" value={detail.notes} />
                    </div>
                  </div>
                )}
              </Section>

              <LoyaltyPanel detail={detail} />
              <OrderHistory detail={detail} />

              <p className="pt-1 font-mono text-[10.5px] text-muted">
                Joined {longDate(detail.createdAt)} · last updated {longDate(detail.updatedAt)}
              </p>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

/**
 * The phone, and the one way it moves.
 *
 * Three deliberate steps — reveal the input, then confirm, then write — because
 * this is the customer's login handle rather than a contact detail: the same
 * keystroke that fixes a typo would, unconfirmed, sign someone out of an account
 * they are in the middle of using. The confirm names both numbers and says
 * plainly what happens to the session.
 *
 * The typed value is normalised in the browser with the storefront's own
 * `normalisePhone`, so the dialog promises the exact digits the column will
 * hold. The server normalises again and is the authority — this is what makes
 * the promise honest, not what makes it true.
 */
function PhonePanel({
  detail,
  onChangePhone,
}: {
  detail: CustomerDetail;
  onChangePhone: (phone: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  const next = normalisePhone(draft);
  const valid = next.length === 10;
  const same = next === detail.phone;

  function cancel() {
    setEditing(false);
    setConfirming(false);
    setDraft("");
  }

  async function commit() {
    setSaving(true);
    const ok = await onChangePhone(draft);
    setSaving(false);
    // A failure keeps the typed number on screen — a collision is corrected by
    // editing what was typed, not by typing it all again.
    if (ok) cancel();
    else setConfirming(false);
  }

  return (
    // Sits in the drawer's `space-y-3` stack and is styled as one of its cards,
    // because it is a peer of "Contact & address", not a row inside it.
    <section className="rounded-[var(--sz-admin-radius-card)] border border-line bg-canvas p-3.5">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1">
          <span className={labelClass}>Phone · login handle</span>
          <span className="font-mono text-[13px] text-body">{detail.phone}</span>
        </p>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setDraft(detail.phone);
              setEditing(true);
            }}
            className="min-h-9 shrink-0 rounded-lg px-1 text-xs font-semibold text-primary-700"
          >
            Change
          </button>
        )}
      </div>

      {editing && (
        <div className="mt-2.5 border-t border-line-soft pt-2.5">
          <label className="block">
            <span className={labelClass}>New number</span>
            <input
              autoFocus
              type="tel"
              inputMode="numeric"
              autoComplete="off"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && valid && !same) setConfirming(true);
                if (e.key === "Escape") cancel();
              }}
              placeholder="98XXXXXXXX"
              aria-describedby="phone-change-hint"
              className={cn(fieldClass, "font-mono")}
            />
          </label>
          <p id="phone-change-hint" className="mt-1.5 text-[11px] text-muted">
            {draft.trim() === "" || same
              ? "Ten digits. +977, spaces and dashes are fine — they’re stripped."
              : valid
                ? `Will be stored as ${next}.`
                : "That isn’t ten digits yet."}
          </p>
          <div className="mt-2.5 flex justify-end gap-2">
            <button
              type="button"
              onClick={cancel}
              className="min-h-10 rounded-lg border border-line bg-raised px-3 text-xs font-semibold text-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={!valid || same}
              className="min-h-10 rounded-lg bg-primary-700 px-3.5 text-xs font-semibold text-white hover:bg-primary-800 disabled:opacity-[var(--sz-disabled-opacity)]"
            >
              Change phone
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        title="Move this customer’s phone?"
        confirmLabel="Move phone"
        busy={saving}
        onCancel={() => setConfirming(false)}
        onConfirm={commit}
        body={
          <>
            <strong className="text-body">{detail.name?.trim() || "This customer"}</strong> signs in with a code
            sent to their phone, so their login moves from{" "}
            <span className="font-mono text-body">{detail.phone}</span> to{" "}
            <span className="font-mono text-body">{next}</span>. Every session they have open ends now, and they
            can only sign in again on the new number.
            <br />
            <br />
            Past orders keep the number they were placed with.
          </>
        }
      />
    </section>
  );
}

/** Loyalty is read-only here. `customers.loyalty_points` is the running balance
 *  the ledger reconciles to, so it is moved by the order flow that writes both
 *  together — never typed into on this screen. */
function LoyaltyPanel({ detail }: { detail: CustomerDetail }) {
  return (
    <section className="rounded-[var(--sz-admin-radius-card)] border border-line bg-canvas p-3.5">
      <div className="mb-2 flex items-baseline gap-2">
        <h4 className="font-display text-md font-medium text-heading">Loyalty</h4>
        <span className="ml-auto font-mono text-[15px] font-semibold text-heading">
          {detail.loyaltyPoints.toLocaleString("en-IN")}
        </span>
        <span className="text-[11px] text-muted">points</span>
      </div>
      {detail.ledger.length === 0 ? (
        <p className="text-[11.5px] text-muted">No loyalty activity yet.</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {detail.ledger.map((entry) => (
            <li key={entry.id} className="flex items-start gap-2 py-1.5">
              <span
                className={cn(
                  "w-14 shrink-0 text-right font-mono text-[12.5px] font-semibold",
                  entry.delta < 0 ? "text-error" : "text-success",
                )}
              >
                {entry.delta > 0 ? "+" : ""}
                {entry.delta}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] text-body">
                  {humanise(entry.reason)}
                  {entry.note ? ` — ${entry.note}` : ""}
                </span>
                <span className="block font-mono text-[10.5px] text-muted">
                  {longDate(entry.at)}
                  {entry.balanceAfter != null ? ` · balance ${entry.balanceAfter}` : ""}
                  {entry.expiresAt ? ` · expires ${shortDate(entry.expiresAt)}` : ""}
                </span>
              </span>
              {entry.orderId != null && (
                <Link
                  href={`/admin/orders/${entry.orderId}`}
                  className="shrink-0 font-mono text-[10.5px] font-semibold text-primary-700 underline underline-offset-2"
                >
                  order
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[10.5px] text-muted">
        History is a record, not a form — points move when an order earns or redeems them.
      </p>
    </section>
  );
}

function OrderHistory({ detail }: { detail: CustomerDetail }) {
  return (
    <section className="rounded-[var(--sz-admin-radius-card)] border border-line bg-canvas p-3.5">
      <h4 className="mb-2 font-display text-md font-medium text-heading">Order history</h4>
      {detail.orders.length === 0 ? (
        <p className="text-[11.5px] text-muted">No orders yet.</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {detail.orders.map((order) => (
            <li key={order.id} className="flex items-center gap-2 py-2">
              <span className="min-w-0 flex-1">
                <Link
                  href={`/admin/orders/${order.id}`}
                  className="block truncate font-mono text-[12.5px] font-semibold text-primary-700 underline underline-offset-2"
                >
                  {order.orderNumber}
                </Link>
                <span className="font-mono text-[10.5px] text-muted">{shortDate(order.createdAt)}</span>
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-pill border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase",
                  STATUS_CHIP[order.statusColour],
                )}
              >
                {order.statusLabel}
              </span>
              <span className="w-24 shrink-0 whitespace-nowrap text-right font-mono text-[12.5px] font-semibold text-heading">
                {money(order.total)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* --- pieces ---------------------------------------------------------------- */

function Section({
  title,
  editing,
  busy,
  onEdit,
  onCancel,
  onSave,
  children,
}: {
  title: string;
  editing: boolean;
  busy: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--sz-admin-radius-card)] border border-line bg-canvas p-3.5">
      <div className="mb-2.5 flex items-center gap-2">
        <h4 className="font-display text-md font-medium text-heading">{title}</h4>
        {editing ? (
          <span className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="min-h-10 rounded-lg border border-line bg-raised px-3 text-xs font-semibold text-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={busy}
              className="min-h-10 rounded-lg bg-primary-700 px-3.5 text-xs font-semibold text-white hover:bg-primary-800 disabled:opacity-50"
            >
              Save
            </button>
          </span>
        ) : (
          <button type="button" onClick={onEdit} className="ml-auto min-h-9 px-1 text-xs font-semibold text-primary-700">
            Edit
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-line-soft bg-canvas px-2.5 py-2">
      <p className={labelClass}>{label}</p>
      <p className="truncate font-mono text-[13px] font-semibold text-heading">{value}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  mono,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "email" | "date";
  mono?: boolean;
}) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(fieldClass, (mono || type === "date") && "font-mono")}
      />
    </label>
  );
}

/** A blank field reads "—" rather than collapsing to nothing, so an empty value
 *  is visibly empty instead of looking like a rendering bug. */
function Readout({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div>
      <p className={labelClass}>{label}</p>
      <p className={cn("whitespace-pre-line text-[13px] text-body", mono && "font-mono")}>{value?.trim() || "—"}</p>
    </div>
  );
}

const pagerButton =
  "inline-flex min-h-10 items-center rounded-[var(--sz-admin-radius-control)] border border-line bg-raised px-3.5 text-[12.5px] font-semibold text-body hover:border-primary-700 disabled:opacity-40 disabled:hover:border-line";

const labelClass = "mb-1 block font-mono text-[9.5px] font-semibold uppercase tracking-[0.07em] text-muted";
const fieldClass =
  "min-h-11 w-full rounded-[var(--sz-admin-radius-control)] border border-line bg-admin-canvas px-2.5 text-[13px] text-body outline-none placeholder:text-muted focus-visible:border-primary-700";

/** `formatPrice` returns null for an unparseable value; a money cell always
 *  shows something rather than an empty column. */
const money = (value: string) => formatPrice(value) ?? "—";

const shortDate = (value: string) =>
  new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });

const longDate = (value: string) => new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

/** `admin_adjust` -> `Admin adjust`. The ledger's reasons are written by the
 *  order flow, so they are shown as they are rather than mapped to a fixed
 *  vocabulary this screen would have to keep in step. */
const humanise = (reason: string) => {
  const spaced = reason.replace(/[_-]+/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : "Adjustment";
};

/** Nulls become empty strings for the inputs; the data layer turns an empty
 *  string back into NULL, so a cleared field really clears the column. */
function toContact(detail: CustomerDetail | null): ContactInput {
  return {
    name: detail?.name ?? "",
    email: detail?.email ?? "",
    addressLine1: detail?.addressLine1 ?? "",
    addressLine2: detail?.addressLine2 ?? "",
    city: detail?.city ?? "",
    state: detail?.state ?? "",
    postalCode: detail?.postalCode ?? "",
    country: detail?.country ?? "",
  };
}

function toPersonal(detail: CustomerDetail | null): PersonalInput {
  return {
    dob: detail?.dob ?? "",
    anniversary: detail?.anniversary ?? "",
    ringSize: detail?.ringSize ?? "",
    bangleSize: detail?.bangleSize ?? "",
    notes: detail?.notes ?? "",
  };
}
