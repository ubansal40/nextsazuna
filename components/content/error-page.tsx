import type { ReactNode } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/ui";
import { cn } from "@/lib/cn";
import { whatsappHref } from "@/lib/whatsapp";

/**
 * The shared error layout — Sazuna Error Pages.dc.html.
 *
 * A floating diamond mark, a mono code, a display-face headline and a row of
 * ways out. 404 and 500 differ only in the mark's tint, the copy and which
 * action leads.
 *
 * Both pages have to work when nothing else does. The Express versions made
 * this explicit: they were the only two that shipped a pre-filled header rather
 * than fetching one, because a database that hangs never settles a fetch and
 * the chrome would stay empty for the whole outage. Here the shell is server
 * rendered from two content blocks that already degrade to null on failure, so
 * the equivalent care is simply that this page reads nothing.
 */

export interface ErrorPageProps {
  code: string;
  title: string;
  blurb: string;
  icon: IconName;
  /** 404 is a wrong turn — warm. 500 is a fault — the error tint. */
  tone: "notice" | "fault";
  children?: ReactNode;
  whatsappText: string;
}

export function ErrorPage({
  code,
  title,
  blurb,
  icon,
  tone,
  children,
  whatsappText,
}: ErrorPageProps) {
  return (
    <div className="mx-auto flex max-w-[var(--sz-policy-container)] items-center justify-center px-10 py-14 policy-narrow:px-[18px]">
      <div className="max-w-[600px] text-center">
        <span aria-hidden className="inline-flex items-center justify-center gap-2.5">
          <span className="size-3 rotate-45 bg-line" />
          <span
            className={cn(
              "inline-flex size-[46px] rotate-45 items-center justify-center animate-float",
              "shadow-[inset_0_0_0_1.5px_rgb(255_255_255/.5)]",
              tone === "fault" ? "bg-primary-50 text-error" : "bg-accent-soft text-primary-700",
            )}
          >
            <span className="inline-flex -rotate-45">
              <Icon name={icon} size={24} strokeWidth={1.7} />
            </span>
          </span>
          <span className="size-3 rotate-45 bg-line" />
        </span>

        <p className="m-0 mt-6 font-mono text-xs uppercase tracking-[var(--sz-tracking-caps)] text-accent-strong">
          {code}
        </p>
        <h1 className="m-0 mt-3 text-page-title font-normal tracking-tight text-heading text-balance policy-narrow:text-page-title-sm">
          {title}
        </h1>
        <p className="mx-auto mt-3.5 max-w-[44ch] text-prose leading-relaxed text-muted [text-wrap:pretty]">
          {blurb}
        </p>

        {children}

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a
            href={whatsappHref(whatsappText)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2.5 rounded-[var(--sz-radius-control)] border border-accent-soft bg-raised px-5 text-control font-semibold text-primary-700 no-underline min-h-[52px] hover:border-primary-700 hover:bg-primary-50 hover:no-underline"
          >
            <Icon name="whatsapp" size={17} />
            WhatsApp support
          </a>
        </div>
      </div>
    </div>
  );
}

/**
 * Back to Home. Primary on the 404, where it is the whole point; secondary on
 * the 500, where "Try again" leads because the page may well work on a retry.
 */
export function ErrorHomeLink({
  label = "Back to Home",
  variant = "primary",
}: {
  label?: string;
  variant?: "primary" | "secondary";
}) {
  return (
    <Link
      href="/"
      className={cn(
        "inline-flex items-center justify-center gap-2.5 rounded-[var(--sz-radius-control)] px-[26px] text-control font-semibold no-underline min-h-[52px] hover:no-underline",
        variant === "primary"
          ? "bg-primary-700 text-white hover:bg-primary-800 hover:text-white"
          : "border border-line bg-raised text-primary-700 hover:border-primary-700",
      )}
    >
      {label}
    </Link>
  );
}
