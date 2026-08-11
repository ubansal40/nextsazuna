"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Icon } from "@/components/ui";
import { formatPrice } from "@/lib/format";
import type { CouponUsage } from "@/lib/admin/coupons";
import { loadCouponUsageAction, resetUsedCountAction, type CouponsResult } from "../_actions";

/**
 * What a coupon has actually cost — Sazuna Admin Coupons.dc.html §Usage.
 *
 * Its own component with its own transition, because it is a second query and
 * must not be able to block a save, nor be blocked by one. That is also why it
 * carries the `loading | ready | failed` phase the rest of the drawer does not
 * need: the coupon itself is already in hand from the list.
 *
 * ## The two counts
 *
 * `coupons.used_count` is the number the checkout refuses on. It is incremented
 * when an order is written and released nowhere — an abandoned gateway redirect
 * inflates it, and an admin applying a code to an order by hand does not raise
 * it at all. So it is shown next to the number of orders that really carry the
 * code, and when they disagree this says so rather than picking one and looking
 * confident. `Reset counter` is the deliberate correction.
 */
type Phase = "loading" | "ready" | "failed";

export function CouponUsagePanel({
  couponId,
  code,
  maxUses,
  gateCount,
  onCorrected,
}: {
  couponId: number;
  code: string;
  maxUses: number | null;
  /** From the list row, so it stays in step with the table after a reset. */
  gateCount: number;
  onCorrected: (result: CouponsResult) => void;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [usage, setUsage] = useState<CouponUsage | null>(null);
  const [busy, startTransition] = useTransition();

  // No `setPhase("loading")` here: the drawer mounts this keyed on the coupon,
  // so every coupon gets a fresh component whose initial phase is already
  // "loading". Resetting it in the effect would only add a cascading render.
  useEffect(() => {
    let live = true;
    loadCouponUsageAction(couponId)
      .then((result) => {
        if (!live) return;
        if (result.ok) {
          setUsage(result.usage);
          setPhase("ready");
        } else {
          setPhase("failed");
        }
      })
      .catch(() => live && setPhase("failed"));
    return () => {
      // A drawer moved to another coupon must not be seeded by the reply for
      // the one it was showing a moment ago.
      live = false;
    };
  }, [couponId]);

  function reload() {
    setPhase("loading");
    startTransition(async () => {
      const result = await loadCouponUsageAction(couponId);
      if (result.ok) {
        setUsage(result.usage);
        setPhase("ready");
      } else {
        setPhase("failed");
      }
    });
  }

  function resetCounter() {
    startTransition(async () => {
      const result = await resetUsedCountAction(couponId);
      onCorrected(result);
      if (result.ok) reload();
    });
  }

  if (phase === "loading") {
    return (
      <Section>
        <p role="status" className="text-[12.5px] text-muted">
          Counting this code&rsquo;s orders…
        </p>
      </Section>
    );
  }

  if (phase === "failed" || !usage) {
    return (
      <Section>
        <div role="alert" className="flex flex-wrap items-center gap-2.5 rounded-xl border border-error-border bg-error-soft px-3.5 py-3">
          <p className="flex-1 text-[12.5px] text-error">Usage figures didn&rsquo;t load. Nothing has been changed.</p>
          <button
            type="button"
            onClick={reload}
            disabled={busy}
            className="min-h-10 rounded-[var(--sz-admin-radius-control)] border border-error-border bg-raised px-3 text-xs font-semibold text-body hover:border-primary-700 disabled:opacity-[var(--sz-disabled-opacity)]"
          >
            Try again
          </button>
        </div>
      </Section>
    );
  }

  if (usage.redemptions === 0 && gateCount === 0) {
    return (
      <Section>
        <div className="rounded-xl border border-line bg-admin-canvas px-4 py-5 text-center">
          <span className="inline-flex size-9 items-center justify-center rounded-pill bg-surface text-muted">
            <Icon name="clock" size={17} />
          </span>
          <p className="mx-auto mt-2 max-w-[42ch] text-[12.5px] leading-relaxed text-muted">
            No redemptions yet. Figures appear here after the first customer uses this code.
          </p>
        </div>
      </Section>
    );
  }

  const drift = usage.redemptions !== gateCount;
  const left = maxUses === null ? null : Math.max(0, maxUses - gateCount);

  return (
    <Section>
      <div className="grid grid-cols-2 gap-2">
        <Stat
          label="Redeemed"
          value={gateCount.toLocaleString("en-IN")}
          note={left === null ? "no limit set" : `${left.toLocaleString("en-IN")} left of ${maxUses?.toLocaleString("en-IN")}`}
        />
        <Stat label="Discount given" value={formatPrice(usage.discountGiven) ?? "—"} note="across every order" />
        <Stat label="Revenue" value={formatPrice(usage.revenue) ?? "—"} note="orders that were paid for" />
        <Stat label="Customers" value={usage.customers.toLocaleString("en-IN")} note="distinct phone numbers" />
      </div>

      {usage.firstAt && usage.lastAt && (
        <p className="mt-2 font-mono text-[11px] text-muted">
          First redeemed {shortDate(usage.firstAt)} · last {shortDate(usage.lastAt)}
        </p>
      )}

      {/* The counter and the orders disagree, and the counter is the one that
          decides whether the code still works — so it is named as such rather
          than quietly reconciled.

          The consequence depends on which way it drifted, and the two are
          opposite: a counter that is too HIGH retires a live promotion early,
          one that is too LOW lets it be redeemed past its limit. Stating only
          one of them would be wrong half the time. */}
      {drift && (
        <div role="status" className="mt-2.5 rounded-xl border border-accent-soft bg-warning-soft px-3.5 py-3">
          <p className="text-[12.5px] leading-relaxed text-[var(--sz-admin-gold-ink)]">
            The counter says <strong>{gateCount.toLocaleString("en-IN")}</strong> but{" "}
            <strong>{usage.redemptions.toLocaleString("en-IN")}</strong>{" "}
            {usage.redemptions === 1 ? "order carries" : "orders carry"} this code. The checkout refuses on the counter,
            so {gateCount > usage.redemptions
              ? "this code can stop working before it has really been used up."
              : "this code can be redeemed more times than its limit allows."}
          </p>
          <button
            type="button"
            onClick={resetCounter}
            disabled={busy}
            aria-busy={busy || undefined}
            className="mt-2.5 inline-flex min-h-10 items-center gap-1.5 rounded-[var(--sz-admin-radius-control)] border border-accent-soft bg-raised px-3 text-xs font-semibold text-body hover:border-primary-700 disabled:cursor-progress disabled:opacity-[var(--sz-disabled-opacity)]"
          >
            <Icon name="refresh" size={14} /> Set it to {usage.redemptions.toLocaleString("en-IN")}
          </button>
        </div>
      )}

      {usage.recent.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-semibold text-body">Recent orders</p>
          <div className="overflow-hidden rounded-xl border border-line">
            {usage.recent.map((order) => (
              <Link
                key={order.id}
                href={`/admin/orders/${order.id}`}
                className="flex min-h-11 items-center gap-2.5 border-b border-line-soft px-3 last:border-b-0 hover:bg-admin-canvas"
              >
                <span className="font-mono text-[12px] font-semibold text-primary-700">{order.orderNumber}</span>
                <span className="font-mono text-[11px] text-muted">{shortDate(order.placedAt)}</span>
                <span className="ml-auto font-mono text-[12px] font-semibold text-heading">
                  {formatPrice(order.total) ?? "—"}
                </span>
              </Link>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-muted">
            Search orders for <span className="font-mono">{code}</span> to see them all.
          </p>
        </div>
      )}
    </Section>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 border-t border-line pt-4">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-accent-strong">Usage</p>
      {children}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl border border-line bg-admin-canvas px-3 py-2.5">
      <span className="block text-[10.5px] font-semibold uppercase tracking-[0.04em] text-muted">{label}</span>
      <span className="mt-0.5 block font-mono text-[15px] font-semibold text-heading">{value}</span>
      <span className="mt-px block text-[10.5px] text-muted">{note}</span>
    </div>
  );
}

/** Dates are formatted on the client so they read in the viewer's locale — the
 *  server sends the ISO instant and nothing else. */
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
