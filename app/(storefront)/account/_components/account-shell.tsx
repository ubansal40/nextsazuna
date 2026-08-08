import type { ReactNode } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ContentKicker } from "@/components/content/policy-page";

/**
 * The account portal's frame — Sazuna Account.dc.html.
 *
 * A sticky rail beside the content from 900px up, a horizontally scrolling tab
 * strip below it. Both are rendered; the breakpoint chooses, as the policy
 * table of contents does.
 *
 * A Server Component: which entry is current comes from the route, so nothing
 * here needs the client. `aria-current="page"` is what carries that to a screen
 * reader — the oxblood bar is only paint.
 */

interface AccountSection {
  href: string;
  label: string;
  icon: IconName;
}

const SECTIONS: AccountSection[] = [
  { href: "/account", label: "Overview", icon: "account" },
  { href: "/account/orders", label: "Orders", icon: "bag" },
  { href: "/account/profile", label: "Profile", icon: "wrench" },
  // Not a portal section — it is the public form, which the spec lists here
  // because this is where someone looks for it.
  { href: "/account-deletion", label: "Delete my data", icon: "trash" },
];

export function AccountShell({
  current,
  title,
  kicker = "Your account",
  children,
}: {
  /** Matched exactly against a section href. */
  current: string;
  title: string;
  kicker?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[var(--sz-container)] px-10 pb-24 policy-narrow:px-[18px]">
      <header className="pt-[34px]">
        <ContentKicker>{kicker}</ContentKicker>
        <h1 className="m-0 text-content-h1 font-normal tracking-tight text-heading policy-stacked:text-content-h1-sm">
          {title}
        </h1>
      </header>

      <div
        className={cn(
          "mt-[30px] grid items-start gap-[var(--sz-account-gap)]",
          "grid-cols-[var(--sz-account-rail)_minmax(0,1fr)]",
          "account-stacked:mt-[18px] account-stacked:grid-cols-1 account-stacked:gap-0",
        )}
      >
        {/* Rail — 900px and up. */}
        <nav
          aria-label="Account"
          className="sticky top-[var(--sz-account-rail-top)] flex flex-col gap-[3px] account-stacked:hidden"
        >
          {SECTIONS.map((section) => (
            <RailLink key={section.href} section={section} current={current} />
          ))}
        </nav>

        {/* Tabs — below 900px. Scrolls rather than wraps, so the row stays one
            line on a phone and the current tab is never orphaned. */}
        <nav
          aria-label="Account"
          className="mb-5 flex gap-2 overflow-x-auto pb-1.5 [-ms-overflow-style:none] [scrollbar-width:none] account-split:hidden [&::-webkit-scrollbar]:hidden"
        >
          {SECTIONS.map((section) => {
            const active = section.href === current;
            return (
              <Link
                key={section.href}
                href={section.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex flex-none items-center rounded-pill border px-4 text-sm font-semibold no-underline min-h-10 hover:no-underline",
                  active
                    ? "border-primary-700 bg-primary-700 text-white"
                    : "border-line bg-raised text-body hover:border-accent",
                )}
              >
                {section.label}
              </Link>
            );
          })}
        </nav>

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

function RailLink({ section, current }: { section: AccountSection; current: string }) {
  const active = section.href === current;
  return (
    <Link
      href={section.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-[var(--sz-radius-control)] px-3.5 py-2.5 text-sm no-underline transition-colors duration-[var(--sz-dur-fast)] hover:no-underline",
        active
          ? "bg-primary-50 font-semibold text-primary-700"
          : "text-body hover:bg-surface hover:text-primary-700",
      )}
    >
      <Icon
        name={section.icon}
        size={17}
        strokeWidth={1.6}
        className={active ? "text-primary-700" : "text-muted"}
      />
      {section.label}
    </Link>
  );
}

/** The card every account panel sits in. */
export const accountCard = "rounded-[var(--sz-radius-xl)] border border-line bg-raised p-5";

export const accountEyebrow =
  "m-0 mb-3.5 font-mono text-badge uppercase tracking-[var(--sz-tracking-caps)] text-accent-strong";
