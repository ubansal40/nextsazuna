import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { getEnabledPaymentMethods, getSiteContact } from "@/lib/content";
import { FOOTER_SECTIONS } from "@/lib/navigation";
import { Icon, type IconName } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * Global storefront footer — SazunaFooter.dc.html.
 *
 * MANDATORY SHARED COMPONENT. Pages render this; they never rebuild a footer.
 * The one dark surface in the system, on its own warm ink ramp.
 *
 * Stays a Server Component throughout — the address, hours, socials and payment
 * marks are read from content blocks so they are editable without a deploy, and
 * the responsive behaviour is CSS and native <details>, so none of it costs a
 * client island.
 *
 * Two arrangements, one set of markup, switched at `footer-stacked` (760px):
 * a five-track rail above it, and below it a single column in which each link
 * section becomes a disclosure rather than a squashed track.
 */

const SOCIAL_ORDER: { key: "instagram" | "facebook" | "tiktok"; icon: IconName; label: string }[] = [
  { key: "instagram", icon: "instagram", label: "Instagram" },
  { key: "facebook", icon: "facebook", label: "Facebook" },
  { key: "tiktok", icon: "tiktok", label: "TikTok" },
];

/**
 * Compact chip labels. The block's own labels ("Credit / Debit Card") are
 * written for the checkout's radio list and are too long for a footer chip.
 */
const CHIP_LABEL: Record<string, string> = {
  cod: "COD",
  esewa: "eSewa",
  khalti: "Khalti",
  fonepay: "Fonepay",
  cybersource: "Card",
};

const footerLinkClass = cn(
  "text-footer-link text-footer-text no-underline",
  "transition-colors duration-[var(--sz-dur-fast)] hover:text-accent hover:no-underline",
  // Stacked, these are the primary way around the site on a phone, so they get
  // a real 44px target instead of the 13.5px line box the rail can afford.
  "footer-stacked:flex footer-stacked:min-h-11 footer-stacked:items-center",
);

export async function SiteFooter() {
  const [contact, paymentMethods] = await Promise.all([
    getSiteContact(),
    getEnabledPaymentMethods(),
  ]);

  const socials = SOCIAL_ORDER.map((social) => ({
    ...social,
    href: contact.social[social.key],
  })).filter((social): social is typeof social & { href: string } => Boolean(social.href));

  return (
    <footer className="bg-footer-bg text-footer-text">
      <div className="mx-auto max-w-[var(--sz-container)] px-10 pt-14 footer-stacked:px-5">
        {/* Brand, then one track per FOOTER_SECTIONS, then contact. Derived
            rather than hardcoded, so adding or removing a link column does not
            silently leave the grid a column short.

            The track list is handed over as a custom property rather than as
            `style={{ gridTemplateColumns }}`. As an inline declaration it beat
            every stylesheet rule regardless of media query, so
            `footer-stacked:grid-cols-1` below could never take effect and the
            footer kept all five columns down to 320px — five ~55px tracks with
            one word per line. As a variable it is only data, and the utilities
            resolve normally at each breakpoint. Deliberately not `--sz-`: it is
            a count-derived layout value, not a design token, and no such token
            exists in globals.css. */}
        <div
          className="grid grid-cols-[var(--footer-cols)] gap-10 footer-stacked:grid-cols-1 footer-stacked:gap-0"
          style={
            {
              "--footer-cols": `1.6fr repeat(${FOOTER_SECTIONS.length}, 1fr) 1.4fr`,
            } as CSSProperties
          }
        >
          <div className="footer-stacked:pb-8">
            <Image
              src="/sazuna-logo.webp"
              alt="Sazuna Jewellers"
              width={1130}
              height={240}
              className="block h-[var(--sz-logo-h-footer)] w-auto"
            />
            <p className="m-0 mt-4 font-[family-name:var(--sz-font-display)] text-control italic text-accent">
              Certified diamonds
            </p>
            <p className="m-0 mt-3 max-w-[40ch] text-control-sm leading-[1.6] text-footer-muted">
              Every piece is certified diamond set in your choice of gold. Buyback, lifetime
              exchange and service, nationwide.
            </p>

            {socials.length > 0 && (
              <div className="mt-5 flex gap-2.5">
                {socials.map((social) => (
                  <a
                    key={social.key}
                    href={social.href}
                    aria-label={social.label}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex size-[var(--sz-social-btn)] items-center justify-center rounded-pill border border-footer-line text-footer-text no-underline transition-colors duration-[var(--sz-dur-fast)] hover:border-accent hover:text-accent hover:no-underline"
                  >
                    <Icon name={social.icon} size={18} strokeWidth={1.6} />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* One track per section on the rail; a stack of disclosures once the
              columns would squash. A real <details>, so it opens without
              JavaScript and announces its state to a screen reader for free —
              and it stays a single copy of the links, rather than one arrangement
              per breakpoint. It is rendered `open`: that is the desktop state,
              where the summary is inert and reads as the eyebrow it replaces.
              Below 760px the summary becomes the control and a customer can
              collapse a section they are done with. */}
          {FOOTER_SECTIONS.map((section) => (
            <nav
              key={section.title}
              aria-label={section.title}
              className="footer-stacked:border-t footer-stacked:border-footer-rule"
            >
              <details open className="group">
                <summary
                  className={cn(
                    "flex list-none items-center justify-between gap-3",
                    "font-mono text-eyebrow uppercase tracking-eyebrow text-footer-eyebrow",
                    "marker:hidden [&::-webkit-details-marker]:hidden",
                    // Inert on the rail: the column is always open there, so the
                    // summary must not invite a click that would close it.
                    "mb-4 pointer-events-none",
                    "footer-stacked:mb-0 footer-stacked:min-h-11 footer-stacked:cursor-pointer",
                    "footer-stacked:pointer-events-auto footer-stacked:py-3.5",
                  )}
                >
                  {section.title}
                  <Icon
                    name="chevron-down"
                    size={15}
                    strokeWidth={2}
                    className={cn(
                      "hidden shrink-0 transition-transform",
                      "duration-[var(--sz-dur-condense)] ease-[var(--sz-ease-out)]",
                      "group-open:rotate-180 footer-stacked:block",
                    )}
                  />
                </summary>
                <ul className="m-0 flex list-none flex-col gap-[11px] p-0 footer-stacked:gap-0 footer-stacked:pb-2.5">
                  {section.links.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href} className={footerLinkClass}>
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            </nav>
          ))}

          <div className="footer-stacked:border-t footer-stacked:border-footer-rule footer-stacked:pt-6">
            <p className="m-0 mb-4 font-mono text-eyebrow uppercase tracking-eyebrow text-footer-eyebrow">
              Visit &amp; contact
            </p>

            {contact.address && (
              <p className="m-0 mb-3 flex items-start gap-[9px]">
                <span className="mt-px shrink-0 text-accent">
                  <Icon name="pin" size={16} strokeWidth={1.6} />
                </span>
                <span className="text-control-sm leading-[1.5] text-footer-text">
                  {contact.address}
                  {contact.hours && (
                    <>
                      <br />
                      <span className="text-footer-muted">Open daily · {contact.hours}</span>
                    </>
                  )}
                </span>
              </p>
            )}

            {contact.phone && (
              <a
                href={`tel:${contact.phone.replace(/\s/g, "")}`}
                className="inline-flex items-center gap-2 text-control-sm text-footer-text no-underline transition-colors duration-[var(--sz-dur-fast)] hover:text-accent hover:no-underline"
              >
                <Icon name="phone" size={15} strokeWidth={1.6} />
                {contact.phone}
              </a>
            )}
          </div>
        </div>

        <div
          className={cn(
            "mt-11 flex flex-wrap items-center justify-between gap-5",
            "border-t border-footer-rule pb-6 pt-5",
            // Side by side there is room for both; stacked there is not, and
            // `justify-between` on a wrapped row leaves the marks stranded.
            "footer-stacked:mt-7 footer-stacked:flex-col footer-stacked:items-start footer-stacked:gap-4",
          )}
        >
          <span className="font-mono text-2xs text-footer-eyebrow">
            © {new Date().getFullYear()} Sazuna Jewellers · Kathmandu, Nepal
          </span>

          {paymentMethods.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-0.5 font-mono text-eyebrow text-footer-eyebrow">We accept</span>
              {paymentMethods.map((method) => (
                <span
                  key={method.code}
                  className="rounded-[5px] border border-footer-line bg-footer-field px-[9px] py-[5px] font-mono text-eyebrow text-footer-text"
                >
                  {CHIP_LABEL[method.code] ?? method.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
