import Image from "next/image";
import Link from "next/link";
import { getEnabledPaymentMethods, getSiteContact } from "@/lib/content";
import { FOOTER_SECTIONS } from "@/lib/navigation";
import { Icon, type IconName } from "@/components/ui";

/**
 * Global storefront footer — SazunaFooter.dc.html.
 *
 * MANDATORY SHARED COMPONENT. Pages render this; they never rebuild a footer.
 * The one dark surface in the system, on its own warm ink ramp.
 *
 * Stays a Server Component. Only the mailing-list form is a client island, and
 * the address, hours, socials and payment marks are read from content blocks so
 * they are editable without a deploy.
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

const footerLinkClass =
  "text-footer-link text-footer-text no-underline transition-colors duration-[var(--sz-dur-fast)] hover:text-accent hover:no-underline";

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
            silently leave the grid a column short. */}
        <div
          className="grid gap-10 footer-stacked:grid-cols-1 footer-stacked:gap-7"
          style={{ gridTemplateColumns: `1.6fr repeat(${FOOTER_SECTIONS.length}, 1fr) 1.4fr` }}
        >
          <div>
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

          {FOOTER_SECTIONS.map((section) => (
            <nav key={section.title} aria-label={section.title}>
              <p className="m-0 mb-4 font-mono text-eyebrow uppercase tracking-eyebrow text-footer-eyebrow">
                {section.title}
              </p>
              <ul className="m-0 flex list-none flex-col gap-[11px] p-0">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className={footerLinkClass}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <div>
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

        <div className="mt-11 flex flex-wrap items-center justify-between gap-5 border-t border-footer-rule pb-6 pt-5">
          <span className="font-mono text-2xs text-footer-eyebrow">
            © {new Date().getFullYear()} Sazuna Jewellers · Kathmandu, Nepal
          </span>

          {paymentMethods.length > 0 && (
            <div className="flex items-center gap-2">
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
