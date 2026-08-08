"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { whatsappHref } from "@/lib/whatsapp";
import type { OrderView } from "@/lib/order-lookup";
import { OrderView as OrderViewPanel } from "@/components/orders/order-view";

/**
 * Guest order lookup — Sazuna Order Status.dc.html §guest lookup.
 *
 * Posts to /api/orders/lookup rather than calling a Server Action. The endpoint
 * mirrors the Express app's one-for-one, it can answer a real 429 when the rate
 * limiter refuses, and a lookup is a read — it should not be a POST to the page
 * it is rendered on.
 *
 * The failure copy is deliberately identical whatever went wrong: a wrong order
 * number, the right number with the wrong phone, and an order still awaiting
 * its gateway all say the same thing. Distinguishing them would confirm which
 * order numbers are real.
 */

const fieldClass =
  "w-full rounded-[var(--sz-radius-btn-lg)] border bg-canvas px-3.5 text-control text-heading outline-none min-h-12 transition-[border-color,box-shadow] duration-[var(--sz-dur)] ease-[var(--sz-ease-out)] focus-visible:border-accent focus-visible:shadow-[var(--sz-ring-focus-soft)]";
const labelClass = "mb-[7px] block text-control-sm font-semibold text-body";

type Stage = "form" | "found" | "missing" | "error";

export function LookupForm() {
  const [orderNumber, setOrderNumber] = useState("");
  const [contact, setContact] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [stage, setStage] = useState<Stage>("form");
  const [order, setOrder] = useState<OrderView | null>(null);
  const [pending, startTransition] = useTransition();

  const orderError = submitted && !orderNumber.trim();
  const contactError = submitted && !contact.trim();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);

    if (!orderNumber.trim() || !contact.trim()) {
      document.getElementById(!orderNumber.trim() ? "os-order" : "os-contact")?.focus();
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch("/api/orders/lookup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ order_number: orderNumber, contact }),
        });

        if (response.ok) {
          const body = (await response.json()) as { order: OrderView };
          setOrder(body.order);
          setStage("found");
          return;
        }
        // 404 is "no such order, or not yours" — the one message. Anything else
        // (429, 500) is our problem, and says so.
        setStage(response.status === 404 ? "missing" : "error");
      } catch {
        setStage("error");
      }
    });
  }

  function reset() {
    setStage("form");
    setOrder(null);
    setSubmitted(false);
  }

  if (stage === "found" && order) {
    return (
      <div className="mt-7">
        <OrderViewPanel order={order} variant="status" />
        <p className="mt-4 text-center">
          <button
            type="button"
            onClick={reset}
            className="cursor-pointer p-1.5 text-sm font-semibold text-muted hover:text-primary-700"
          >
            Track a different order
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-7 max-w-[520px]">
      <form
        onSubmit={submit}
        noValidate
        className="flex flex-col gap-4 rounded-[var(--sz-radius-xl)] border border-line bg-raised p-6"
      >
        <div>
          <label htmlFor="os-order" className={labelClass}>
            Order number
          </label>
          <input
            id="os-order"
            value={orderNumber}
            onChange={(event) => setOrderNumber(event.target.value)}
            aria-required="true"
            aria-invalid={orderError}
            aria-describedby={orderError ? "os-order-err" : undefined}
            autoComplete="off"
            spellCheck={false}
            placeholder="e.g. SZ-260808-A1B"
            className={cn(fieldClass, "font-mono", orderError ? "border-error-border" : "border-line")}
          />
          {orderError && <FieldError id="os-order-err">Please enter your order number.</FieldError>}
        </div>

        <div>
          <label htmlFor="os-contact" className={labelClass}>
            Phone or email
          </label>
          <input
            id="os-contact"
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            aria-required="true"
            aria-invalid={contactError}
            aria-describedby={contactError ? "os-contact-err" : undefined}
            autoComplete="tel"
            placeholder="Phone or email from checkout"
            className={cn(fieldClass, contactError ? "border-error-border" : "border-line")}
          />
          {contactError && (
            <FieldError id="os-contact-err">Enter the phone or email used at checkout.</FieldError>
          )}
        </div>

        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="inline-flex cursor-pointer items-center justify-center gap-2.5 rounded-[var(--sz-radius-control)] bg-primary-700 text-control font-semibold text-white min-h-[52px] transition-colors duration-[var(--sz-dur-fast)] hover:bg-primary-800 disabled:opacity-[var(--sz-disabled-opacity)]"
        >
          {pending && (
            <span
              aria-hidden
              className="size-[17px] animate-spin rounded-pill border-2 border-white/45 border-t-white"
            />
          )}
          {pending ? "Tracking…" : "Track order"}
        </button>
      </form>

      {stage === "missing" && (
        <div className="mt-4 flex gap-3 rounded-[var(--sz-radius-md)] border border-error-border bg-error-soft p-4">
          <Icon name="alert" size={20} className="mt-0.5 flex-none text-error" />
          <div>
            <p className="m-0 text-sm font-semibold text-heading">We couldn&rsquo;t find that order</p>
            <p className="m-0 mt-1.5 text-sm leading-relaxed text-muted">
              Double-check the order number and the phone or email used at checkout. Still stuck?
              We&rsquo;re happy to help.
            </p>
            <a
              href={whatsappHref("Hi, I can't find my order on the tracking page.")}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary-700 no-underline hover:no-underline"
            >
              <Icon name="whatsapp" size={15} />
              WhatsApp support
            </a>
          </div>
        </div>
      )}

      {stage === "error" && (
        <div className="mt-4 rounded-[var(--sz-radius-md)] border border-line bg-raised p-6 text-center">
          <p className="m-0 font-[family-name:var(--sz-font-display)] text-modal-title font-medium text-heading">
            Something went wrong
          </p>
          <p className="mx-auto m-0 mt-2 max-w-[36ch] text-sm leading-relaxed text-muted">
            We couldn&rsquo;t reach the order system, or you&rsquo;ve tried a few times in quick
            succession. Please wait a moment and try again.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-5 cursor-pointer rounded-[var(--sz-radius-btn-lg)] bg-primary-700 px-6 text-sm font-semibold text-white min-h-[46px] hover:bg-primary-800"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} role="alert" className="m-0 mt-1.5 flex items-center gap-1.5 text-trust text-error">
      <Icon name="alert" size={13} strokeWidth={2} />
      {children}
    </p>
  );
}
