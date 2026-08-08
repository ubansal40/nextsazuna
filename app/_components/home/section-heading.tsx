import Link from "next/link";
import { Icon } from "@/components/ui";

/**
 * The eyebrow + heading + optional "View all" that opens most homepage
 * sections — spec's repeated header block. One component so the five sections
 * that use it cannot drift apart.
 */
export function SectionHeading({
  eyebrow,
  heading,
  link,
  centered = false,
  children,
}: {
  eyebrow?: string;
  heading?: string;
  link?: { text: string; href: string } | null;
  /** Testimonials centre theirs. */
  centered?: boolean;
  /** Replaces the heading — the product edit puts its tabs here. */
  children?: React.ReactNode;
}) {
  const header = (
    <div>
      {eyebrow && (
        <p
          className={`m-0 mb-3 flex items-center gap-2 font-mono text-2xs uppercase tracking-caps text-accent-strong ${
            centered ? "justify-center" : ""
          }`}
        >
          <span aria-hidden="true" className="size-[5px] rotate-45 bg-accent" />
          {eyebrow}
        </p>
      )}
      {children ??
        (heading && (
          <h2 className="m-0 font-[family-name:var(--sz-font-display)] text-h2 font-normal leading-[1.06] tracking-tight text-heading home-narrow:text-h2-sm">
            {heading}
          </h2>
        ))}
    </div>
  );

  if (centered) {
    return <div className="mb-[34px] text-center">{header}</div>;
  }

  if (!link) return <div className="mb-[30px]">{header}</div>;

  return (
    <div className="mb-[30px] flex flex-wrap items-end justify-between gap-5">
      {header}
      <Link
        href={link.href}
        className="inline-flex shrink-0 items-center gap-[7px] whitespace-nowrap text-sm font-semibold text-primary-700 no-underline hover:text-primary-800 hover:no-underline"
      >
        {link.text}
        <Icon name="arrow-right" size={14} strokeWidth={1.8} />
      </Link>
    </div>
  );
}
