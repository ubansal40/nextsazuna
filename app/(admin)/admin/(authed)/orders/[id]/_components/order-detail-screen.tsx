"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Icon, useToast } from "@/components/ui";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { ProductThumb } from "@/components/admin/product-thumb";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import type { OrderDetail, OrderItemRow, OrderLineInput } from "@/lib/admin/order-detail";
import type { OrderStatusRow } from "@/lib/admin/order-statuses";
import { STATUS_CHIP } from "../../_components/status-badge";
import {
  saveItemsAction,
  saveCustomerAction,
  savePaymentAction,
  applyPromoAction,
  removePromoAction,
  addNoteAction,
  setDetailStatusAction,
  cancelOrderAction,
  type DetailResult,
} from "../_actions";

/**
 * Order detail — Sazuna Admin Orders.dc.html.
 *
 * Each section edits in place rather than in a drawer, per the spec: view, then
 * "Edit", then Save or Cancel. Sections are independent so a half-finished
 * address edit cannot take the line items down with it.
 *
 * Every save returns the re-read order rather than patching local state,
 * because these edits recompute the totals server-side — the screen must show
 * what was stored, not what the client hoped for.
 */

const CANCEL_REASONS = [
  "Customer changed their mind",
  "Out of stock",
  "Payment not received",
  "Duplicate order",
  "Delivery not possible",
  "Other",
];

export function OrderDetailScreen({
  initial,
  statuses,
}: {
  initial: OrderDetail;
  statuses: OrderStatusRow[];
}) {
  const { toast } = useToast();
  const [order, setOrder] = useState(initial);
  const [busy, startTransition] = useTransition();

  const [editingItems, setEditingItems] = useState(false);
  const [lines, setLines] = useState<OrderLineInput[]>([]);
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [customer, setCustomer] = useState(toCustomerInput(initial));
  const [editingPayment, setEditingPayment] = useState(false);
  const [payment, setPayment] = useState(toPaymentInput(initial));
  const [promoInput, setPromoInput] = useState("");
  const [note, setNote] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState(CANCEL_REASONS[0]);
  const [cancelNote, setCancelNote] = useState("");

  function handle(result: DetailResult, ok?: string) {
    if (result.ok) {
      setOrder(result.order);
      setCustomer(toCustomerInput(result.order));
      setPayment(toPaymentInput(result.order));
      if (ok) toast("success", ok);
    } else {
      toast("error", result.error);
    }
  }

  const run = (action: () => Promise<DetailResult>, ok?: string) =>
    startTransition(async () => handle(await action(), ok));

  const whatsapp = `https://wa.me/${order.phone.replace(/\D/g, "").replace(/^0+/, "")}`;

  return (
    <div className="mx-auto max-w-[900px]">
      <Link
        href="/admin/orders"
        className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-primary-700"
      >
        <Icon name="arrow-left" size={15} /> All orders
      </Link>

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <h2 className="font-mono text-xl font-semibold tracking-[-0.02em] text-heading">{order.orderNumber}</h2>
        <span className={cn("rounded-pill border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase", STATUS_CHIP[order.statusColour])}>
          {order.statusLabel}
        </span>
        <span className="font-mono text-[11px] text-muted">
          {new Date(order.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
        </span>

        <span className="ml-auto flex flex-wrap items-center gap-2">
          <select
            value={order.status}
            onChange={(e) => {
              const next = statuses.find((s) => s.key === e.target.value);
              if (next) run(() => setDetailStatusAction(order.id, next.key), `Moved to ${next.label}.`);
            }}
            aria-label="Order status"
            disabled={busy}
            className="min-h-11 min-w-[168px] rounded-[var(--sz-admin-radius-control)] border border-line bg-raised px-2.5 text-[12.5px] font-semibold text-body"
          >
            {statuses.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--sz-admin-radius-control)] border border-line bg-raised px-3.5 text-[12.5px] font-semibold text-whatsapp hover:border-whatsapp"
          >
            <Icon name="whatsapp" size={15} /> WhatsApp
          </a>
          {order.status !== "cancelled" && (
            <button
              type="button"
              onClick={() => setCancelling(true)}
              className="inline-flex min-h-11 items-center rounded-[var(--sz-admin-radius-control)] border border-error-border bg-raised px-3.5 text-[12.5px] font-semibold text-error hover:bg-error-soft"
            >
              Cancel order
            </button>
          )}
        </span>
      </div>

      {order.cancelReason && (
        <p role="status" className="mb-4 rounded-xl border border-error-border bg-error-soft px-3.5 py-2.5 text-[12.5px] text-body">
          Cancelled — <strong className="text-heading">{order.cancelReason}</strong>
        </p>
      )}

      {/* --- items --- */}
      <Section
        title="Items"
        editing={editingItems}
        onEdit={() => {
          setLines(order.items.map(toLineInput));
          setEditingItems(true);
        }}
        onCancel={() => setEditingItems(false)}
        onSave={() => {
          setEditingItems(false);
          run(() => saveItemsAction(order.id, lines), "Items saved.");
        }}
        saveLabel="Save items"
        busy={busy}
      >
        {editingItems ? (
          <ItemsEditor lines={lines} onChange={setLines} />
        ) : (
          <ul className="divide-y divide-line-soft">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-2.5">
                <ProductThumb src={item.imageUrl} alt="" size={38} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-heading">{item.name}</span>
                  <span className="font-mono text-[11px] text-muted">{item.sku}</span>
                </span>
                <span className="whitespace-nowrap font-mono text-[12px] text-muted">
                  {money(item.unitPrice)} × {item.quantity}
                </span>
                <span className="w-24 whitespace-nowrap text-right font-mono text-[13px] font-semibold text-heading">
                  {money(item.lineTotal)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* --- customer --- */}
      <Section
        title="Customer & delivery"
        editing={editingCustomer}
        onEdit={() => setEditingCustomer(true)}
        onCancel={() => {
          setCustomer(toCustomerInput(order));
          setEditingCustomer(false);
        }}
        onSave={() => {
          setEditingCustomer(false);
          run(() => saveCustomerAction(order.id, customer), "Details saved.");
        }}
        saveLabel="Save details"
        busy={busy}
      >
        {editingCustomer ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" value={customer.customerName} onChange={(v) => setCustomer({ ...customer, customerName: v })} />
            <Field label="Phone" value={customer.phone} onChange={(v) => setCustomer({ ...customer, phone: v })} mono />
            <Field label="Email" value={customer.email} onChange={(v) => setCustomer({ ...customer, email: v })} />
            <Field label="City" value={customer.city} onChange={(v) => setCustomer({ ...customer, city: v })} />
            <div className="sm:col-span-2">
              <Field label="Delivery address" value={customer.addressLine1} onChange={(v) => setCustomer({ ...customer, addressLine1: v })} />
            </div>
            <Field label="Area / landmark" value={customer.addressLine2} onChange={(v) => setCustomer({ ...customer, addressLine2: v })} />
            <Field label="Postal code" value={customer.postalCode} onChange={(v) => setCustomer({ ...customer, postalCode: v })} mono />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Readout label="Name" value={order.customerName} />
            <Readout label="Phone" value={order.phone} mono />
            <Readout label="Email" value={order.email || "—"} />
            <Readout
              label="Delivery address"
              value={[order.addressLine1, order.addressLine2, order.city, order.postalCode].filter(Boolean).join(", ") || "—"}
            />
          </div>
        )}
      </Section>

      {/* --- payment + totals --- */}
      <Section
        title="Payment"
        editing={editingPayment}
        onEdit={() => setEditingPayment(true)}
        onCancel={() => {
          setPayment(toPaymentInput(order));
          setEditingPayment(false);
        }}
        onSave={() => {
          setEditingPayment(false);
          run(() => savePaymentAction(order.id, payment), "Payment saved.");
        }}
        busy={busy}
      >
        {editingPayment ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={labelClass}>Method</span>
              <select
                value={payment.paymentMethod}
                onChange={(e) => setPayment({ ...payment, paymentMethod: e.target.value })}
                className={fieldClass}
              >
                {["cod", "cash", "card", "bank_transfer", "esewa", "khalti", "fonepay", "cybersource", "upi"].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelClass}>Payment status</span>
              <select
                value={payment.paymentStatus}
                onChange={(e) => setPayment({ ...payment, paymentStatus: e.target.value })}
                className={fieldClass}
              >
                {["pending", "paid", "failed", "refunded"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <div className="sm:col-span-2">
              <Field
                label="Discount (रु)"
                value={payment.discount}
                onChange={(v) => setPayment({ ...payment, discount: v })}
                hint="A manual discount on this order, on top of any promo code."
                mono
              />
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Readout label="Method" value={order.paymentMethod} />
            <Readout label="Payment status" value={order.paymentStatus} />
          </div>
        )}

        <div className="mt-4 border-t border-line-soft pt-3">
          <p className={labelClass}>Promo code</p>
          {order.couponCode ? (
            <div className="flex items-center gap-2">
              <span className="rounded-pill border border-accent-soft bg-warning-soft px-2.5 py-1 font-mono text-[11px] font-semibold text-[var(--sz-admin-gold-ink)]">
                {order.couponCode}
              </span>
              <span className="font-mono text-[12.5px] font-semibold text-primary-700">
                − {money(order.discountAmount)}
              </span>
              <button
                type="button"
                onClick={() => run(() => removePromoAction(order.id), "Promo removed.")}
                disabled={busy}
                aria-label="Remove promo code"
                className="ml-auto inline-flex size-9 items-center justify-center rounded-[7px] text-error hover:bg-error-soft"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                value={promoInput}
                onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && promoInput.trim()) {
                    run(() => applyPromoAction(order.id, promoInput), "Promo applied.");
                    setPromoInput("");
                  }
                }}
                placeholder="e.g. SAZUNA10"
                aria-label="Promo code"
                className={cn(fieldClass, "font-mono uppercase")}
              />
              <button
                type="button"
                disabled={!promoInput.trim() || busy}
                onClick={() => {
                  run(() => applyPromoAction(order.id, promoInput), "Promo applied.");
                  setPromoInput("");
                }}
                className="min-h-11 shrink-0 rounded-[var(--sz-admin-radius-control)] border border-line bg-raised px-4 text-[12.5px] font-semibold text-primary-700 hover:border-primary-700 disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          )}
        </div>

        <dl className="mt-4 space-y-1.5 border-t border-line-soft pt-3">
          <Row label="Subtotal" value={money(order.subtotal)} />
          {Number(order.discountAmount) > 0 && (
            <Row label="Discount" value={`− ${money(order.discountAmount)}`} tone="primary" />
          )}
          {Number(order.loyaltyDiscount) > 0 && (
            <Row label="Loyalty" value={`− ${money(order.loyaltyDiscount)}`} tone="primary" />
          )}
          {Number(order.shippingAmount) > 0 && <Row label="Delivery & surcharge" value={money(order.shippingAmount)} />}
          {Number(order.taxAmount) > 0 && <Row label="Tax" value={money(order.taxAmount)} />}
          <div className="flex items-baseline justify-between border-t border-line pt-2">
            <dt className="text-[13px] font-semibold text-heading">Total</dt>
            <dd className="font-mono text-lg font-semibold tracking-[-0.02em] text-heading">
              {money(order.totalAmount)}
            </dd>
          </div>
        </dl>
      </Section>

      {/* --- activity --- */}
      <section className="mb-4 rounded-[var(--sz-admin-radius-card)] border border-line bg-raised p-4">
        <h3 className="mb-2.5 font-display text-md font-medium text-heading">Activity</h3>
        <div className="mb-3 flex gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && note.trim()) {
                run(() => addNoteAction(order.id, note), "Note added.");
                setNote("");
              }
            }}
            aria-label="Add an internal note"
            placeholder="Add an internal note…"
            className={fieldClass}
          />
          <button
            type="button"
            disabled={!note.trim() || busy}
            onClick={() => {
              run(() => addNoteAction(order.id, note), "Note added.");
              setNote("");
            }}
            className="min-h-11 shrink-0 rounded-[var(--sz-admin-radius-control)] bg-primary-700 px-4 text-[12.5px] font-semibold text-white hover:bg-primary-800 disabled:opacity-50"
          >
            Add
          </button>
        </div>

        {order.feed.length === 0 ? (
          <p className="text-xs text-muted">Nothing has happened on this order yet.</p>
        ) : (
          <ol className="space-y-2.5">
            {order.feed.map((entry) => (
              <li key={entry.id} className="flex gap-2.5">
                <span
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-pill",
                    entry.kind === "note" ? "bg-accent" : entry.kind === "cancel" ? "bg-error" : "bg-primary-700",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] text-body">
                    {entry.kind === "status" && !entry.message ? (
                      <>
                        Status changed from <strong className="text-heading">{label(statuses, entry.fromStatus)}</strong> to{" "}
                        <strong className="text-heading">{label(statuses, entry.toStatus)}</strong>
                      </>
                    ) : (
                      entry.message ?? "Updated"
                    )}
                  </span>
                  <span className="font-mono text-[10.5px] text-muted">
                    {new Date(entry.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                    {entry.actor ? ` · ${entry.actor}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <ConfirmDialog
        open={cancelling}
        title="Cancel this order?"
        tone="danger"
        confirmLabel="Cancel order"
        busy={busy}
        onCancel={() => setCancelling(false)}
        onConfirm={() => {
          setCancelling(false);
          run(() => cancelOrderAction(order.id, cancelReason, cancelNote), "Order cancelled.");
          setCancelNote("");
        }}
        body={
          <>
            <label className="block">
              <span className={labelClass}>
                Cancellation reason <span className="text-error">*</span>
              </span>
              <select value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className={fieldClass}>
                {CANCEL_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block">
              <span className={labelClass}>Note · optional</span>
              <textarea
                value={cancelNote}
                onChange={(e) => setCancelNote(e.target.value)}
                rows={2}
                placeholder="Anything the team should know"
                className={cn(fieldClass, "resize-y py-2")}
              />
            </label>
          </>
        }
      />
    </div>
  );
}

/* --- pieces ---------------------------------------------------------------- */

function ItemsEditor({ lines, onChange }: { lines: OrderLineInput[]; onChange: (next: OrderLineInput[]) => void }) {
  const patch = (index: number, next: Partial<OrderLineInput>) =>
    onChange(lines.map((line, i) => (i === index ? { ...line, ...next } : line)));

  return (
    <div className="space-y-2">
      {lines.map((line, index) => (
        <div key={line.id ?? `new-${index}`} className="flex flex-wrap items-end gap-2 rounded-[10px] border border-line-soft bg-canvas p-2.5">
          <label className="min-w-[160px] flex-[2_1_160px]">
            <span className={labelClass}>Product</span>
            <input value={line.name} onChange={(e) => patch(index, { name: e.target.value })} className={fieldClass} />
          </label>
          <label className="min-w-[100px] flex-1">
            <span className={labelClass}>SKU</span>
            <input value={line.sku} onChange={(e) => patch(index, { sku: e.target.value })} className={cn(fieldClass, "font-mono")} />
          </label>
          <label className="w-[110px]">
            <span className={labelClass}>Unit price</span>
            <input
              value={line.unitPrice}
              onChange={(e) => patch(index, { unitPrice: e.target.value })}
              inputMode="decimal"
              className={cn(fieldClass, "font-mono")}
            />
          </label>
          <label className="w-[74px]">
            <span className={labelClass}>Qty</span>
            <input
              value={line.quantity}
              onChange={(e) => patch(index, { quantity: Number(e.target.value.replace(/\D/g, "")) || 1 })}
              inputMode="numeric"
              className={cn(fieldClass, "font-mono")}
            />
          </label>
          <button
            type="button"
            onClick={() => onChange(lines.filter((_, i) => i !== index))}
            aria-label={`Remove ${line.name || "line"}`}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-[7px] text-error hover:bg-error-soft"
          >
            <Icon name="trash" size={16} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...lines, { id: null, productId: null, name: "", sku: "", unitPrice: "0", quantity: 1 }])}
        className="inline-flex min-h-11 items-center gap-2 rounded-[var(--sz-admin-radius-control)] border border-line bg-raised px-3.5 text-[12.5px] font-semibold text-primary-700 hover:border-primary-700"
      >
        <Icon name="plus" size={15} strokeWidth={2} /> Add a line
      </button>
      <p className="text-[11px] text-muted">
        A per-order price is fine — a price agreed at the counter, or a remade piece. Saving recomputes the total.
      </p>
    </div>
  );
}

function Section({
  title,
  editing,
  onEdit,
  onCancel,
  onSave,
  saveLabel = "Save",
  busy,
  children,
}: {
  title: string;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  saveLabel?: string;
  busy: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4 rounded-[var(--sz-admin-radius-card)] border border-line bg-raised p-4">
      <div className="mb-2.5 flex items-center gap-2">
        <h3 className="font-display text-md font-medium text-heading">{title}</h3>
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
              {saveLabel}
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

function Field({
  label,
  value,
  onChange,
  hint,
  mono,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className={cn(fieldClass, mono && "font-mono")} />
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

function Readout({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className={labelClass}>{label}</p>
      <p className={cn("text-[13px] text-body", mono && "font-mono")}>{value}</p>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "primary" }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-[12.5px] text-muted">{label}</dt>
      <dd className={cn("font-mono text-[12.5px]", tone === "primary" ? "text-primary-700" : "text-body")}>{value}</dd>
    </div>
  );
}

/** `formatPrice` returns null for an unparseable value; an order line always
 *  shows something rather than an empty cell. */
const money = (value: string) => formatPrice(value) ?? "—";

const labelClass = "mb-1 block font-mono text-[9.5px] font-semibold uppercase tracking-[0.07em] text-muted";
const fieldClass =
  "min-h-11 w-full rounded-[var(--sz-admin-radius-control)] border border-line bg-admin-canvas px-2.5 text-[13px] text-body outline-none placeholder:text-muted focus-visible:border-primary-700";

function label(statuses: OrderStatusRow[], key: string | null): string {
  if (!key) return "—";
  return statuses.find((s) => s.key === key)?.label ?? key;
}

function toLineInput(item: OrderItemRow): OrderLineInput {
  return {
    id: item.id,
    productId: item.productId,
    name: item.name,
    sku: item.sku,
    unitPrice: item.unitPrice,
    quantity: item.quantity,
  };
}

function toCustomerInput(order: OrderDetail) {
  return {
    customerName: order.customerName,
    phone: order.phone,
    email: order.email,
    addressLine1: order.addressLine1,
    addressLine2: order.addressLine2 ?? "",
    city: order.city,
    state: order.state,
    postalCode: order.postalCode,
  };
}

function toPaymentInput(order: OrderDetail) {
  return {
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    discount: order.discountAmount,
  };
}
