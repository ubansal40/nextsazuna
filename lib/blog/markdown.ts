/**
 * The Journal's markdown renderer.
 *
 * A faithful port of the Express app's server/services/blog-render.js, and it
 * is a port rather than a swap for `marked` or `remark` on purpose: the two
 * posts that exist were written against these exact rules, and a general
 * markdown library would change what they mean.
 *
 * ── WHY THIS NEEDS NO SANITISER ────────────────────────────────────────────
 * `render` escapes the ENTIRE source first, then applies formatting to the
 * escaped text. Because escaping strictly precedes every rule, raw HTML in a
 * post is already inert by the time any rule could see it — `<script>` has
 * become `&lt;script&gt;` and can never be reconstituted. There is no window in
 * which markup exists and has not yet been cleaned, which is the window a
 * sanitiser exists to close.
 *
 * The trade is that a post cannot contain literal HTML. For a jeweller's
 * journal that is a feature.
 *
 * The one vector escaping cannot reach is a URL inside a link or image, since
 * those are attributes rather than text. `safeUrl` is an allowlist for that.
 *
 * Pure: no I/O, no `server-only`. scripts/check-blog-render.mts drives it
 * directly with the assertions ported from the reference's own test suite.
 */

/** The five characters that could otherwise start markup or break an attribute. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * URLs a link or image may point at.
 *
 * Escaping has already run by the time this is called, so a colon may appear
 * as-is but angle brackets cannot. Anything not matched returns empty, and the
 * caller then renders the link text alone rather than a dead or dangerous href
 * — `javascript:`, `data:` and `vbscript:` all fall through here.
 */
export function safeUrl(raw: unknown): string {
  const url = String(raw ?? "").trim();
  if (!url) return "";
  if (/^(https?:\/\/|mailto:)/i.test(url)) return url;
  // Site-relative, but NOT protocol-relative: `//evil.com` is a different host.
  if (/^\/[^/]/.test(url) || url === "/") return url;
  if (url.startsWith("#")) return url;
  return "";
}

/** Inline rules, applied to already-escaped text. */
function inline(text: string): string {
  return (
    text
      // Images first: ![alt](url) would otherwise match the link rule.
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt: string, url: string) => {
        const href = safeUrl(url);
        // A bad URL degrades to the alt text rather than an empty frame.
        return href
          ? `<img src="${href}" alt="${alt}" loading="eager" decoding="async">`
          : alt;
      })
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, url: string) => {
        const href = safeUrl(url);
        if (!href) return label;
        // Only links that actually leave the site open a tab.
        const external = /^https?:\/\//i.test(href);
        const attrs = external ? ' target="_blank" rel="noopener"' : "";
        return `<a href="${href}"${attrs}>${label}</a>`;
      })
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
  );
}

/**
 * Markdown to HTML.
 *
 * Supported, and nothing else: `#`–`######` headings clamped to h2–h4 (never
 * h1 — the page's h1 is the post title), paragraphs, `-`/`*` and `1.` lists,
 * `>` blockquotes, `---` rules, fenced code, and the inline set above.
 */
export function render(source: unknown): string {
  const text = String(source ?? "").trim();
  if (!text) return "";

  // THIS LINE is what makes everything below safe. Nothing after it can
  // introduce markup that the author wrote.
  const lines = escapeHtml(text).replace(/\r\n?/g, "\n").split("\n");

  const out: string[] = [];
  let paragraph: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | null = null;
  let fence: string[] | null = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      out.push(`<p>${inline(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      out.push(`<${list.tag}>${list.items.join("")}</${list.tag}>`);
      list = null;
    }
  };
  const flush = () => {
    flushParagraph();
    flushList();
  };

  for (const line of lines) {
    // Fenced code swallows everything, markdown included, until it closes.
    if (/^```/.test(line.trim())) {
      if (fence) {
        out.push(`<pre><code>${fence.join("\n")}</code></pre>`);
        fence = null;
      } else {
        flush();
        fence = [];
      }
      continue;
    }
    if (fence) {
      fence.push(line);
      continue;
    }

    const trimmed = line.trim();

    if (!trimmed) {
      flush();
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flush();
      /**
       * Clamp to h2–h4. `#` and `##` both land on h2, deeper levels on h3 then
       * h4. A body that could emit an h1 would give the page two, since the
       * post title already is one.
       */
      const level = Math.min(4, Math.max(2, heading[1].length));
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      flush();
      out.push("<hr>");
      continue;
    }

    // Escaping ran first, so `>` is now `&gt;`.
    const quote = /^&gt;\s?(.*)$/.exec(trimmed);
    if (quote) {
      flush();
      out.push(`<blockquote>${inline(quote[1])}</blockquote>`);
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (bullet || numbered) {
      flushParagraph();
      const tag = bullet ? "ul" : "ol";
      // Consecutive items join one list rather than opening a new one each time.
      if (!list || list.tag !== tag) {
        flushList();
        list = { tag, items: [] };
      }
      list.items.push(`<li>${inline((bullet ?? numbered)![1])}</li>`);
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  // An author who forgets a closing fence should not lose the tail of the post.
  if (fence) out.push(`<pre><code>${fence.join("\n")}</code></pre>`);
  flush();

  return out.join("\n");
}

/** Never zero — "0 min read" reads as broken. 200 words a minute. */
export function readingMinutes(source: unknown): number {
  const words = String(source ?? "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** "15 April 2026", or empty. Never the string "Invalid Date". */
export function formatPostDate(value: unknown): string {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** YYYY-MM-DD for `datetime`, or empty. */
export function isoDate(value: unknown): string {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function postHref(slug: string): string {
  return `/blog/${encodeURIComponent(slug)}`;
}

/** A heading id, for anchors and the table of contents. */
export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/&[a-z]+;/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export interface TocHeading {
  id: string;
  label: string;
}

/**
 * Give every h2 an id and collect them for the rail.
 *
 * Runs over the rendered HTML rather than the markdown so the ids match what
 * the anchors actually point at. Duplicate headings get a numeric suffix — two
 * sections called "Care" would otherwise share one anchor and the second would
 * be unreachable.
 */
export function withHeadingIds(html: string): { html: string; toc: TocHeading[] } {
  const toc: TocHeading[] = [];
  const seen = new Map<string, number>();

  const out = html.replace(/<h2>(.*?)<\/h2>/g, (_match, label: string) => {
    const base = slugifyHeading(label) || "section";
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    const id = count === 1 ? base : `${base}-${count}`;
    toc.push({ id, label: label.replace(/<[^>]*>/g, "") });
    return `<h2 id="${id}">${label}</h2>`;
  });

  return { html: out, toc };
}
