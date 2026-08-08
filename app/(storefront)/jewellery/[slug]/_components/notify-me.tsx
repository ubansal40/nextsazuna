"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/ui";
import { bigButtonClass, whatsappButtonClass } from "./pdp-actions";
import { joinWaitlist, type NotifyResult } from "./notify-actions";

export interface NotifyMeProps {
  slug: string;
  whatsappHref?: string | null;
}

type Stage = "prompt" | "submitted" | "already" | "error";

const inputClass =
  "w-full rounded-[var(--sz-radius-thumb)] border border-line bg-canvas px-3.5 text-sm text-heading outline-none min-h-[var(--sz-notify-input-h)] transition-[border-color,box-shadow] duration-[var(--sz-dur)] ease-[var(--sz-ease-out)] focus-visible:border-primary-700 focus-visible:shadow-[var(--sz-ring-focus-soft)]";

const headingClass =
  "font-[family-name:var(--sz-font-display)] font-medium text-md text-heading";

const bodyClass = "m-0 text-control-sm leading-[1.5] text-muted";

function Outcome({
  tone,
  icon,
  title,
  children,
}: {
  tone: "success" | "warning" | "error";
  icon: "check" | "info" | "alert";
  title: string;
  children: React.ReactNode;
}) {
  const badge = {
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-[#8A6A22]",
    error: "bg-primary-50 text-primary-700",
  }[tone];

  return (
    <div className="animate-fade px-1 py-1.5 text-center">
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
              value={contact}
              onChange={(event) => setContact(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
              }}
              aria-label="Phone or email"
              placeholder="Phone or email"
              autoComplete="tel"
              className={inputClass}
            />
            <button
              type="button"
              onClick={submit}
              disabled={!contact.trim()}
              className="w-full cursor-pointer rounded-md bg-primary-700 text-control font-semibold text-white min-h-[var(--sz-control-h-md)] transition-colors duration-[var(--sz-dur-fast)] hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-[var(--sz-disabled-opacity)]"
            >
              Notify Me
            </button>
          </div>
        </>
      ) : stage === "submitted" ? (
        <Outcome tone="success" icon="check" title="You're on the list">
          <p className={`${bodyClass} mt-1.5`}>
            We&rsquo;ll reach out at <strong className="text-body">{contact.trim()}</strong> as soon
            as it&rsquo;s back.
          </p>
        </Outcome>
      ) : stage === "already" ? (
        <Outcome tone="warning" icon="info" title="You're already subscribed">
          <p className={`${bodyClass} mt-1.5`}>
            This contact is already on the waitlist for this piece.
          </p>
        </Outcome>
      ) : (
        <Outcome tone="error" icon="alert" title="That didn't go through">
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
