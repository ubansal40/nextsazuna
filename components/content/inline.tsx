import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import type { InlineText } from "@/lib/content-pages/types";

/**
 * The inline vocabulary for content-page copy: `**bold**` and `[label](href)`.
 *
 * Policy prose needs emphasis and the occasional link — a WhatsApp number, a
 * pointer to the returns page — but nothing beyond that. Two options were on
 * the table: author the data as `.tsx` so paragraphs could carry JSX, or parse
 * a tiny notation. JSX in content files drags markup into data and would make
 * the copy awkward to move behind an admin editor later, so this parses.
 *
 * It builds React elements and never goes near `dangerouslySetInnerHTML`, so
 * the notation cannot be used to inject markup — an unmatched `**` or a stray
 * `<` renders as the literal characters a reader typed.
 */

/** `**bold**` or `[label](href)`, whichever comes first. */
const TOKEN = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;

export function renderInline(text: InlineText): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;

  for (const match of text.matchAll(TOKEN)) {
    const at = match.index;
    if (at > last) out.push(text.slice(last, at));

    const [, bold, label, href] = match;
    if (bold !== undefined) {
      out.push(<strong key={key++}>{bold}</strong>);
    } else if (label !== undefined && href !== undefined) {
      out.push(<InlineLink key={key++} href={href} label={label} />);
    }

    last = at + match[0].length;
  }

  if (last < text.length) out.push(text.slice(last));

  // A run with no markup is by far the common case; hand back the plain string
  // rather than wrapping every paragraph in an array of one.
  if (out.length === 1 && typeof out[0] === "string") return out[0];
  return <>{out.map((node, i) => <Fragment key={i}>{node}</Fragment>)}</>;
}

function InlineLink({ href, label }: { href: string; label: string }) {
  // Only same-origin paths get the router. A mailto:, tel: or wa.me link is not
  // a navigation, and handing one to <Link> would have it prefetch a route that
  // does not exist.
  if (href.startsWith("/")) return <Link href={href}>{label}</Link>;

  // http(s) leaves the site, so it opens in a new tab and drops the referrer,
  // matching how the shell treats its WhatsApp links. mailto:/tel: do neither —
  // target="_blank" on a mail link leaves a blank tab behind.
  const leavesSite = /^https?:\/\//.test(href);
  return (
    <a
      href={href}
      target={leavesSite ? "_blank" : undefined}
      rel={leavesSite ? "noopener noreferrer" : undefined}
    >
      {label}
    </a>
  );
}
