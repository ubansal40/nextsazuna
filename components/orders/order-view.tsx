import Link from "next/link";
import { Icon, type IconName } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { OrderView as OrderViewData, TimelineStep } from "@/lib/order-lookup";
import { whatsappHref } from "@/lib/whatsapp";
import { CopyOrderNumber } from "./copy-order-number";

/**
 * The order surface — Sazuna Order Status.dc.html.
 *
 * One component behind two routes, because the spec draws them as one file:
 * `confirmation` is the page a gateway lands on, `status` is what a guest sees
 * after looking their order up. They show the same order; they differ in what
 * the reader has just done.
 *
 * Everything rendered here comes from the order row. Nothing is read out of the
 * URL a gateway supplied, so the page cannot be made to claim a payment that
 * did not settle.
 */

const PAYMENT_LABELS: Record<string, string> = {
  cod: "Cash on Delivery",
  esewa: "eSewa",
  khalti: "Khalti",
  cybersource: "Card",
};

interface Banner {
  title: string;
  detail: string;
  chip: string;
  icon: IconName;
  tone: "paid" | "pending" | "failed";
}

function banner(order: OrderViewData): Banner {
  const label = PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod;

  if (order.paymentStatus === "paid") {
    return {
      title: `Paid · ${label}`,
      detail: "Payment confirmed. A receipt has been sent to you.",
      chip: "Paid",
      icon: "check",
      tone: "paid",
    };
  }

  if (order.paymentStatus === "failed" || order.status === "payment_failed") {
    return {
      title: "Payment could not be completed",
      detail: "No charge was made. You can retry, or reach us on WhatsApp.",
      chip: "Action needed",
      icon: "alert",
      tone: "failed",
    };
  }

  if (order.paymentMethod === "cod") {
    return {
      title: "Cash on Delivery",
      detail: "Pay in cash when your order arrives. Please keep the exact amount ready.",
      chip: "Order placed",
      icon: "wallet",
      tone: "pending",
    };
  }

  return {
    title: `Awaiting ${label}`,
    detail: "We haven't had confirmation from your payment provider yet. If money left your account, it will settle shortly.",
    chip: "Pending",
    icon: "clock",
    tone: "pending",
  };
}

const TONES = {
  paid: {
    panel: "border-line bg-raised",
    icon: "bg-success-soft text-success",
    chip: "bg-success-soft text-success",
  },
  pending: {
    panel: "border-line bg-raised",
    icon: "bg-primary-50 text-primary-700",
    chip: "bg-warning-soft text-warning",
  },
  failed: {
    panel: "border-error-border bg-error-soft",
    icon: "bg-error-soft text-error",
    chip: "bg-error-soft text-error",
  },
} as const;

const cardClass = "rounded-[var(--sz-radius-xl)] border border-line bg-raised p-5";
const eyebrowClass =
  "m-0 mb-3.5 font-mono text-badge uppercase tracking-[var(--sz-tracking-caps)] text-accent-strong";

export function OrderView({
  order,
  variant,
  onTrackHref,
}: {
  order: OrderViewData;
  variant: "confirmation" | "status";
  /** Where "Track order" points. Omitted on the status page — you are there. */
  onTrackHref?: string;
}) {
  const state = banner(order);
  const tone = TONES[state.tone];
  const support = whatsappHref(`Hi Sazuna — I have a question about order ${order.orderNumber}.`);

  return (
    <div className="mx-auto max-w-[840px]">
      {variant === "confirmation" ? (
        <ConfirmationHead order={order} failed={state.tone === "failed"} />
      ) : (
        <StatusHead order={order} />
      )}

      {/* Payment banner */}
      <div
        className={cn("mt-7 flex items-center gap-3.5 rounded-[var(--sz-radius-lg)] border p-4", tone.panel)}
      >
        <span
          className={cn(
            "inline-flex size-[42px] flex-none items-center justify-center rounded-[var(--sz-radius-md)]",
            tone.icon,
          )}
        >
          <Icon name={state.icon} size={21} strokeWidth={1.7} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-control-sm font-semibold text-heading">{state.title}</p>
          <p className="m-0 mt-0.5 text-trust text-muted">{state.detail}</p>
        </div>
        <span
          className={cn(
            "flex-none rounded-pill px-3 py-1.5 text-trust font-semibold whitespace-nowrap",
            tone.chip,
          )}
        >
          {state.chip}
        </span>
      </div>

      {state.tone === "failed" && (
        <div className="mt-3.5 flex flex-wrap gap-2.5">
          <Link
            href="/checkout"
            className="inline-flex min-w-[180px] flex-1 items-center justify-center rounded-[var(--sz-radius-btn-lg)] bg-primary-700 text-sm font-semibold text-white no-underline min-h-12 hover:bg-primary-800 hover:text-white hover:no-underline"
          >
            Retry payment
          </Link>
          <SupportLink href={support} className="min-w-[180px] flex-1" />
        </div>
      )}

      <div className="mt-3.5 grid gap-3.5 grid-cols-2 order-stacked:grid-cols-1">
        {variant === "status" && (
          <section className={cardClass}>
            <p className={eyebrowClass}>Status</p>
            <Timeline steps={order.timeline} />
          </section>
        )}

        <section className={cn(cardClass, variant === "confirmation" && "col-span-2 order-stacked:col-span-1")}>
          <p className={eyebrowClass}>Order summary</p>
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
            {order.items.map((item, index) => (
              <li key={`${item.sku ?? item.name}-${index}`} className="flex gap-3.5">
                <div className="flex-1">
                  <p className="m-0 font-[family-name:var(--sz-font-display)] text-control-sm leading-snug text-heading">
                    {item.name}
                  </p>
                  <p className="m-0 mt-1 font-mono text-2xs text-muted">
                    {[item.sku, item.quantity > 1 && `× ${item.quantity}`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span className="font-mono text-control-sm whitespace-nowrap text-body tabular-nums">
                  {item.lineTotal}
                </span>
              </li>
            ))}
          </ul>

          <dl className="m-0 mt-4 border-t border-line-soft pt-3.5">
            <Row label="Subtotal" value={order.totals.subtotal} />
            {order.totals.discount && (
              <Row label="Promo" value={`−${order.totals.discount}`} tone="success" />
            )}
            {order.totals.extras && <Row label="Gift wrap / surcharge" value={order.totals.extras} />}
            <div className="mt-2 flex items-baseline justify-between border-t border-line-soft pt-3">
              <dt className="text-sm font-semibold text-heading">Total</dt>
              <dd className="m-0 font-mono text-summary-total font-semibold tracking-tight text-primary-700 tabular-nums">
                {order.totals.total}
              </dd>
            </div>
          </dl>
        </section>

        <section className={cn(cardClass, variant === "confirmation" && "col-span-2 order-stacked:col-span-1")}>
          <p className={eyebrowClass}>Delivery to</p>
          <address className="text-sm leading-relaxed text-body not-italic">
            {order.customerName}
            {order.address.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
            {order.phone && <span className="mt-1 block font-mono text-trust text-muted">{order.phone}</span>}
          </address>
        </section>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {onTrackHref && (
          <Link
            href={onTrackHref}
            className="inline-flex min-w-[200px] flex-1 items-center justify-center gap-2.5 rounded-[var(--sz-radius-control)] bg-primary-700 text-control font-semibold text-white no-underline min-h-[52px] hover:bg-primary-800 hover:text-white hover:no-underline"
          >
            Track order
            <Icon name="arrow-right" size={17} />
          </Link>
        )}
        <SupportLink href={support} className="min-w-[200px] flex-1" />
      </div>

      <p className="mt-5 text-center">
        <Link
          href="/jewellery"
          className="inline-flex items-center gap-2 text-sm font-semibold text-primary-700 no-underline hover:no-underline"
        >
          Continue shopping
          <Icon name="arrow-right" size={15} />
        </Link>
      </p>
    </div>
  );
}

function ConfirmationHead({ order, failed }: { order: OrderViewData; failed: boolean }) {
  return (
    <div className="pt-11 text-center">
      <span
        className={cn(
          "inline-flex size-[66px] items-center justify-center rounded-pill animate-scale-in",
          failed ? "bg-error-soft text-error" : "bg-success-soft text-success",
        )}
      >
        <Icon name={failed ? "alert" : "check"} size={32} strokeWidth={2.2} />
      </span>
      <h1 className="m-0 mt-5 text-content-h1 font-normal tracking-tight text-heading text-balance policy-stacked:text-content-h1-sm">
        {failed ? "Your order is saved" : "Thank you — your order is confirmed"}
      </h1>
      <p className="mx-auto mt-3 max-w-[46ch] text-control leading-relaxed text-muted">
        {failed
          ? "We've held your order — it just needs payment to be completed."
          : "We've received your order and will be in touch shortly to arrange delivery."}
      </p>
      <OrderNumberChip orderNumber={order.orderNumber} />
    </div>
  );
}

function StatusHead({ order }: { order: OrderViewData }) {
  const current = order.timeline.find((step) => step.current) ?? order.timeline[0];
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--sz-radius-lg)] border border-line bg-raised px-5 py-4">
      <div>
        <p className="m-0 font-mono text-xs text-muted-soft">Order</p>
        <p className="m-0 font-mono text-lg font-semibold text-heading">{order.orderNumber}</p>
      </div>
      <span className="rounded-pill bg-warning-soft px-3.5 py-1.5 text-xs font-semibold text-warning">
        {current?.label ?? order.status}
      </span>
    </div>
  );
}

function OrderNumberChip({ orderNumber }: { orderNumber: string }) {
  return (
    <span className="mt-5 inline-flex items-center gap-3 rounded-[var(--sz-radius-md)] border border-line bg-raised px-4 py-3">
      <span className="text-start">
        <span className="block text-2xs leading-none text-muted">Order number</span>
        <span className="font-mono text-lg font-semibold tracking-wide text-heading">
          {orderNumber}
        </span>
      </span>
      <CopyOrderNumber orderNumber={orderNumber} />
    </span>
  );
}

function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="m-0 flex list-none flex-col p-0">
      {steps.map((step, index) => (
        <li key={step.key} className="flex gap-3.5">
          <div className="flex flex-col items-center">
            <span
              className={cn(
                "inline-flex size-[22px] flex-none items-center justify-center rounded-pill border-2",
                step.done
                  ? "border-primary-700 bg-primary-700 text-white"
                  : "border-control-track bg-raised",
              )}
            >
              {step.done && <Icon name="check" size={12} strokeWidth={3} />}
            </span>
            {index < steps.length - 1 && (
              <span
                className={cn("w-0.5 flex-1", step.done ? "bg-primary-700" : "bg-line")}
                style={{ minHeight: 14 }}
              />
            )}
          </div>
          <div className="pb-3.5">
            <p
              className={cn(
                "m-0 text-sm font-semibold",
                step.done ? "text-heading" : "text-muted-soft",
              )}
            >
              {step.label}
            </p>
            {step.at && (
              <time dateTime={step.at} className="mt-0.5 block text-2xs text-muted-soft">
                {new Date(step.at).toLocaleString("en-GB", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "success" }) {
  return (
    <div className="flex justify-between py-1 text-sm">
      <dt className={tone === "success" ? "text-success" : "text-muted"}>{label}</dt>
      <dd
        className={cn(
          "m-0 font-mono tabular-nums",
          tone === "success" ? "text-success" : "text-body",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function SupportLink({ href, className }: { href: string; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center justify-center gap-2.5 rounded-[var(--sz-radius-control)] border border-accent-soft bg-raised px-5 text-control font-semibold text-primary-700 no-underline min-h-[52px] hover:border-primary-700 hover:bg-primary-50 hover:no-underline",
        className,
      )}
    >
      <Icon name="whatsapp" size={17} />
      WhatsApp support
    </a>
  );
}
