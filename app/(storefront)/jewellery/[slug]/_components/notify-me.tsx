"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/ui";
import { bigButtonClass, whatsappButtonClass } from "./pdp-actions";
import { joinWaitlist, type NotifyResult } from "./notify-actions";

export interface NotifyMeProps {
  slug: string;
  whatsappHref?: string | null;
}

type Stage = "prompt" | "submitted" | "already" | "error";

// No focus ring here: the global :focus-visible rule owns it (CLAUDE.md). The
// soft ring this used to set was ~1.3:1 against the raised surface and beat the
// global one on specificity, so focused fields read as unfocused.
const inputClass =
  "w-full rounded-[var(--sz-radius-thumb)] border border-line bg-canvas px-3.5 text-sm text-heading outline-none min-h-[var(--sz-notify-input-h)] transition-[border-color] duration-[var(--sz-dur)] ease-[var(--sz-ease-out)] focus-visible:border-primary-700";

const headingClass =
  "font-[family-name:var(--sz-font-display)] font-medium text-md text-heading";

const bodyClass = "m-0 text-control-sm leading-[1.5] text-muted";

/**
 * The result panel.
 *
 * `role="status"` announces it, and it takes focus (see the effect below),
 * because submitting unmounts the button that had it — without both, a screen
 * reader is left on <body> and never hears the answer.
 */
function Outcome({
  panelRef,
  tone,
  icon,
  title,
  children,
}: {
  panelRef: React.RefObject<HTMLDivElement | null>;
  tone: "success" | "warning" | "error";
  icon: "check" | "info" | "alert";
  title: string;
  children: React.ReactNode;
}) {
  const badge = {
    success: "bg-success-soft text-success-ink",
    warning: "bg-warning-soft text-warning-ink",
    error: "bg-primary-50 text-primary-700",
  }[tone];

  return (
    <div
      ref={panelRef}
      role="status"
      aria-live="polite"
      tabIndex={-1}
      className="animate-fade px-1 py-1.5 text-center"
    >
      <span className={`inline-flex size-11 items-center justify-center rounded-pill ${badge}`}>
        <Icon name={icon} size={22} strokeWidth={icon === "check" ? 2.2 : 1.8} />
      </span>
      <p className={`${headingClass} mt-3`}>{title}</p>
      {children}
    </div>
  );
}

/**
 * Back-in-stock form — spec lines 166-191.
 *
 * Four resting states plus the in-flight one, exactly as the spec enumerates
 * them. "Already subscribed" is a real answer from the server, not a guess: the
 * action checks the waiting list before inserting.
 */
export function NotifyMe({ slug, whatsappHref }: NotifyMeProps) {
  const [stage, setStage] = useState<Stage>("prompt");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [pending, startTransition] = useTransition();

  const outcomeRef = useRef<HTMLDivElement>(null);
  const contactRef = useRef<HTMLInputElement>(null);
  /** Whether the form has ever left the prompt — so mount does not steal focus. */
  const settled = useRef(false);

  /*
   * Every transition here unmounts the control that had focus: submitting
   * replaces the button with a result, "Try again" replaces the result with the
   * form. Either way focus would fall to <body>, stranding keyboard and screen
   * reader users at the top of the document.
   */
  useEffect(() => {
    if (stage !== "prompt") {
      settled.current = true;
      outcomeRef.current?.focus();
      return;
    }
    if (settled.current) contactRef.current?.focus();
  }, [stage]);

  function submit() {
    startTransition(async () => {
      const result: NotifyResult = await joinWaitlist({ slug, name, contact });
      setStage(
        result === "created"
          ? "submitted"
          : result === "already"
            ? "already"
            : // An invalid contact and a server failure land on the same panel;
              // the copy asks the reader to check their details either way.
              "error",
      );
    });
  }

  return (
    <div className="rounded-[var(--sz-radius-lg)] border border-line bg-raised p-5">
      {pending ? (
        <div className="flex min-h-[120px] items-center justify-center gap-[11px]">
          <span className="size-[22px] animate-spin rounded-pill border-[2.5px] border-line border-t-primary-700" />
          <span className="text-sm text-muted">Adding you to the list…</span>
        </div>
      ) : stage === "prompt" ? (
        <>
          <p className={headingClass}>Notify me when it&rsquo;s back</p>
          <p className={`${bodyClass} mb-3.5 mt-1.5`}>
            Leave your details — we&rsquo;ll reach out the moment this piece returns.
          </p>
          <div className="flex flex-col gap-2.5">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-label="Your name"
              placeholder="Your name"
              autoComplete="name"
              className={inputClass}
            />
            <input
              ref={contactRef}
              value={contact}
              onChange={(event) => setContact(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
              }}
              aria-label="Phone or email"
              aria-required="true"
              aria-describedby="notify-contact-help"
              placeholder="Phone or email"
              autoComplete="tel"
              className={inputClass}
            />
            {/* The button below is disabled until this is filled in. A disabled
                control cannot be focused and so cannot explain itself — the
                requirement has to be stated in text that is always readable. */}
            <p id="notify-contact-help" className="m-0 text-trust text-muted">
              A phone number or email is required — it&rsquo;s how we&rsquo;ll reach you. Your name
              is optional.
            </p>
            <button
              type="button"
              onClick={submit}
              disabled={!contact.trim()}
              aria-describedby="notify-contact-help"
              className="w-full cursor-pointer rounded-md bg-primary-700 text-control font-semibold text-white min-h-[var(--sz-control-h-md)] transition-colors duration-[var(--sz-dur-fast)] hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-[var(--sz-disabled-opacity)]"
            >
              Notify Me
            </button>
          </div>
        </>
      ) : stage === "submitted" ? (
        <Outcome panelRef={outcomeRef} tone="success" icon="check" title="You're on the list">
          <p className={`${bodyClass} mt-1.5`}>
            We&rsquo;ll reach out at <strong className="text-body">{contact.trim()}</strong> as soon
            as it&rsquo;s back.
          </p>
        </Outcome>
      ) : stage === "already" ? (
        <Outcome panelRef={outcomeRef} tone="warning" icon="info" title="You're already subscribed">
          <p className={`${bodyClass} mt-1.5`}>
            This contact is already on the waitlist for this piece.
          </p>
        </Outcome>
      ) : (
        <Outcome panelRef={outcomeRef} tone="error" icon="alert" title="That didn't go through">
          <p className={`${bodyClass} mb-3.5 mt-1.5`}>Please check your details and try again.</p>
          <button
            type="button"
            onClick={() => setStage("prompt")}
            className="cursor-pointer rounded-[var(--sz-radius-thumb)] bg-primary-700 px-6 text-sm font-semibold text-white min-h-[var(--sz-notify-input-h)] transition-colors duration-[var(--sz-dur-fast)] hover:bg-primary-800"
          >
            Try again
          </button>
        </Outcome>
      )}

      {whatsappHref && (
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className={`${bigButtonClass} ${whatsappButtonClass} mt-3 min-h-[var(--sz-control-h-md)]`}
        >
          <Icon name="whatsapp-solid" size={18} />
          WhatsApp Inquiry
        </a>
      )}
    </div>
  );
}
