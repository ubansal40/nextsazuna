"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { requestAccountDeletion, type DeletionRequestResult } from "../_actions";

/**
 * The deletion request form.
 *
 * FIELD CONTRACT — the maxlengths are load-bearing. They mirror exactly what
 * requestAccountDeletion truncates to (200 / 30 / 120 / 2000), which is what
 * makes the limit here a convenience rather than something the server relies
 * on. Shortening one of these alone would silently cut a request that the
 * server would have accepted whole.
 *
 * `noValidate` stays: without it the browser's own bubble fires before this
 * page's message, and the two disagree about what is wrong.
 */

const fieldClass =
  "w-full rounded-[var(--sz-radius-btn-lg)] border bg-canvas px-3.5 py-2.5 text-control text-heading outline-none min-h-12 transition-[border-color,box-shadow] duration-[var(--sz-dur)] ease-[var(--sz-ease-out)] focus-visible:border-accent focus-visible:shadow-[var(--sz-ring-focus-soft)]";
const labelClass = "mb-[7px] block text-control-sm font-semibold text-body";
const optionalClass = "font-normal text-muted-soft";
const helpClass = "m-0 mt-1.5 text-trust text-muted";

export function DeletionForm() {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<DeletionRequestResult | null>(null);
  const [pending, startTransition] = useTransition();

  // Matches the server's check, so the two cannot disagree about what is valid.
  const emailError = submitted && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    setResult(null);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      document.getElementById("del-email")?.focus();
      return;
    }

    startTransition(async () => {
      const outcome = await requestAccountDeletion({ email, phone, name, reason });
      setResult(outcome);
      if (outcome === "sent") {
        setEmail("");
        setPhone("");
        setName("");
        setReason("");
        setSubmitted(false);
      }
    });
  }

  if (result === "sent") {
    return (
      <div className="mt-5 flex gap-3 rounded-[var(--sz-radius-lg)] border border-success-border bg-success-soft p-5">
        <Icon name="check" size={20} strokeWidth={2} className="mt-0.5 flex-none text-success" />
        <div>
          <p className="m-0 text-sm font-semibold text-heading">Request received</p>
          <p className="m-0 mt-1.5 text-sm leading-relaxed text-body">
            We&rsquo;ll confirm by email within 3 business days and complete deletion within 30 days.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="mt-5 flex flex-col gap-4 rounded-[var(--sz-radius-xl)] border border-line bg-raised p-6"
    >
      <div>
        <label htmlFor="del-email" className={labelClass}>
          Email <span className="text-primary-700">*</span>
        </label>
        <input
          id="del-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          maxLength={200}
          autoComplete="email"
          aria-required="true"
          aria-invalid={emailError}
          aria-describedby={emailError ? "del-email-err" : "del-email-help"}
          className={cn(fieldClass, emailError ? "border-error-border" : "border-line")}
        />
        {emailError ? (
          <p id="del-email-err" role="alert" className="m-0 mt-1.5 flex items-center gap-1.5 text-trust text-error">
            <Icon name="alert" size={13} strokeWidth={2} />
            Please enter a valid email address.
          </p>
        ) : (
          <p id="del-email-help" className={helpClass}>
            Required — we&rsquo;ll confirm to this address.
          </p>
        )}
      </div>

      <div>
        <label htmlFor="del-phone" className={labelClass}>
          Phone <span className={optionalClass}>(optional)</span>
        </label>
        <input
          id="del-phone"
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          maxLength={30}
          autoComplete="tel"
          aria-describedby="del-phone-help"
          className={cn(fieldClass, "border-line")}
        />
        <p id="del-phone-help" className={helpClass}>
          Helps us match older orders.
        </p>
      </div>

      <div>
        <label htmlFor="del-name" className={labelClass}>
          Name <span className={optionalClass}>(optional)</span>
        </label>
        <input
          id="del-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={120}
          autoComplete="name"
          aria-describedby="del-name-help"
          className={cn(fieldClass, "border-line")}
        />
        <p id="del-name-help" className={helpClass}>
          As it appears on your orders.
        </p>
      </div>

      <div>
        <label htmlFor="del-reason" className={labelClass}>
          Reason <span className={optionalClass}>(optional)</span>
        </label>
        <textarea
          id="del-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={2000}
          rows={3}
          aria-describedby="del-reason-help"
          className={cn(fieldClass, "border-line resize-y")}
        />
        <p id="del-reason-help" className={helpClass}>
          Helps us improve. No impact on the request.
        </p>
      </div>

      {(result === "error" || result === "throttled") && (
        <p role="alert" className="m-0 flex gap-2.5 rounded-[var(--sz-radius-md)] border border-error-border bg-error-soft p-3.5 text-sm leading-relaxed text-body">
          <Icon name="alert" size={17} className="mt-0.5 flex-none text-error" />
          {result === "throttled" ? (
            <span>You&rsquo;ve sent a few requests already — please give it a few minutes.</span>
          ) : (
            <span>
              We couldn&rsquo;t submit your request. Please email{" "}
              <a href="mailto:privacy@sazunajewellers.com">privacy@sazunajewellers.com</a> directly,
              or message us on WhatsApp.
            </span>
          )}
        </p>
      )}

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
        {pending ? "Submitting…" : "Submit deletion request"}
      </button>
    </form>
  );
}
