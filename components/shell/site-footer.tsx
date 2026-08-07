import Image from "next/image";
import Link from "next/link";
import { Icon, type IconName } from "@/components/ui";
import { FOOTER_SECTIONS, LEGAL_LINKS } from "@/lib/navigation";

const SOCIALS: { icon: IconName; label: string; href: string }[] = [
  { icon: "instagram", label: "Instagram", href: "https://instagram.com" },
  { icon: "facebook", label: "Facebook", href: "https://facebook.com" },
  { icon: "youtube", label: "YouTube", href: "https://youtube.com" },
];

const PAYMENT_MARKS = ["Visa", "Mastercard", "eSewa", "Khalti", "Cash on delivery"];

/**
 * Global storefront footer — spec §Global shell.
 *
 * MANDATORY SHARED COMPONENT. Pages render this; they never rebuild a footer.
 * Stays a Server Component — nothing here needs client state.
 */
export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line bg-surface">
      <div className="mx-auto max-w-[var(--sz-container)] px-6 py-14 md:px-10">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Image
              src="/sazuna-logo.webp"
              alt="Sazuna Jewellers"
              width={1130}
              height={240}
              className="h-6 w-auto"
            />
            <p className="mt-4 max-w-[42ch] text-sm leading-[var(--sz-leading-relaxed)] text-muted">
              Certified, exact, quietly premium. Every Sazuna diamond is graded by SGL and travels
              with its certificate.
            </p>
            <div className="mt-5 flex gap-2">
              {SOCIALS.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  aria-label={social.label}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex size-10 items-center justify-center rounded-[var(--sz-radius-control)] border border-line bg-raised text-body no-underline transition-colors duration-[var(--sz-dur-fast)] hover:border-primary-700 hover:text-primary-700"
                >
                  <Icon name={social.icon} size={18} />
                </a>
              ))}
            </div>
          </div>

          {FOOTER_SECTIONS.map((section) => (
            <nav key={section.title} aria-label={section.title}>
              <p className="mb-3.5 font-mono text-2xs uppercase tracking-[var(--sz-tracking-caps)] text-muted">
                {section.title}
              </p>
              <ul className="flex flex-col gap-2.5 list-none p-0 m-0">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-body no-underline transition-colors duration-[var(--sz-dur-fast)] hover:text-primary-700"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-4 border-t border-line pt-7">
          <ul className="flex flex-wrap gap-2 list-none p-0 m-0">
            {PAYMENT_MARKS.map((mark) => (
              <li
                key={mark}
                className="rounded-[var(--sz-radius-xs)] border border-line bg-raised px-2.5 py-1 font-mono text-2xs text-muted"
              >
                {mark}
              </li>
            ))}
          </ul>

          <div className="ml-auto flex flex-wrap items-center gap-5">
            {LEGAL_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-xs text-muted no-underline hover:text-primary-700"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        <p className="mt-6 text-xs text-muted">
          © {new Date().getFullYear()} Sazuna Jewellers. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
