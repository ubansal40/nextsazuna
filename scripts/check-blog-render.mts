#!/usr/bin/env node
/**
 * Journal renderer checks.
 *
 * Ported from the Express app's test/unit/blog-render.test.js, because the two
 * posts that exist were written against these exact rules and the renderer is
 * the one place in this codebase that turns author-supplied text into HTML.
 *
 * The security assertions are the point. The renderer escapes its whole source
 * before applying a single rule, so raw HTML in a post is inert text rather
 * than markup — which is why it needs no sanitiser, and why swapping in a
 * general markdown library would be a regression rather than a simplification.
 *
 * Run: npx tsx scripts/check-blog-render.mts
 */
import {
  escapeHtml,
  formatPostDate,
  isoDate,
  postHref,
  readingMinutes,
  render,
  safeUrl,
  slugifyHeading,
  withHeadingIds,
} from "../lib/blog/markdown";

const script = render("<script>alert(1)</script>");
const img = render('<img src=x onerror="alert(1)">');
const badImage = render("![a ring](javascript:alert(1))");
const external = render("[a](https://example.com)");
const internal = render("[a](/jewellery)");
const headings = render("# One\n\n## Two\n\n### Three\n\n#### Four\n\n##### Five");
const mixed = render("Hello there.\n\n- a\n- b\n\n1. x\n2. y\n\n> quoted\n\n---");
const oneList = render("- a\n- b\n- c");
const fenced = render("```\n## not a heading\n- not a list\n```");
const unterminated = render("```\nsome code that never closes");
const inlineBits = render("**b** *i* `c`");
const dupes = withHeadingIds(render("## Care\n\nx\n\n## Care\n\ny"));

const checks: [string, boolean][] = [
  // --- the security contract ------------------------------------------------
  ["raw HTML is inert, not stripped", !script.includes("<script") && script.includes("&lt;script&gt;")],
  ["an img onerror payload never becomes markup", !img.includes("<img src=x") && img.includes("&lt;img")],
  [
    "javascript:, data: and vbscript: URLs are dropped, text kept",
    ["javascript:alert(1)", "data:text/html,<script>x</script>", "vbscript:x"].every((scheme) => {
      const html = render(`[click](${scheme})`);
      return !html.includes("href=") && html.includes("click");
    }),
  ],
  ["protocol-relative //evil.com is not site-relative", safeUrl("//evil.com/x") === ""],
  [
    "http, https, mailto, anchors and site-relative are allowed",
    ["https://a.com", "http://a.com", "mailto:a@b.com", "/x", "#s"].every((u) => safeUrl(u) === u),
  ],
  [
    "external links get target and rel=noopener",
    external.includes('rel="noopener"') && external.includes('target="_blank"'),
  ],
  ["internal links stay in the tab", !internal.includes("target=")],
  ["an image with a bad URL degrades to its alt text", !badImage.includes("<img") && badImage.includes("a ring")],
  ["quotes in text cannot break out of an attribute", escapeHtml('a"b') === "a&quot;b"],
  ["ampersands are escaped first, so entities cannot be forged", escapeHtml("&lt;") === "&amp;lt;"],

  // --- formatting -----------------------------------------------------------
  ["no h1 ever comes from body markdown", !headings.includes("<h1>")],
  ["headings render at h2, h3 and h4", ["<h2>Two</h2>", "<h3>Three</h3>", "<h4>Four</h4>"].every((h) => headings.includes(h))],
  ["deeper levels clamp to h4", headings.includes("<h4>Five</h4>")],
  ["paragraphs render", mixed.includes("<p>Hello there.</p>")],
  ["one ul and one ol, four items", (mixed.match(/<ul>/g) ?? []).length === 1 && (mixed.match(/<ol>/g) ?? []).length === 1 && (mixed.match(/<li>/g) ?? []).length === 4],
  ["blockquotes render despite > being escaped first", mixed.includes("<blockquote>quoted</blockquote>")],
  ["rules render", mixed.includes("<hr>")],
  ["consecutive items form ONE list", (oneList.match(/<ul>/g) ?? []).length === 1 && (oneList.match(/<\/ul>/g) ?? []).length === 1],
  ["fenced code does not interpret markdown inside it", !fenced.includes("<h2>") && !fenced.includes("<li>") && fenced.includes("<pre><code>")],
  ["an unterminated fence still renders its content", unterminated.includes("some code that never closes")],
  [
    "inline bold, italic and code",
    inlineBits.includes("<strong>b</strong>") && inlineBits.includes("<em>i</em>") && inlineBits.includes("<code>c</code>"),
  ],
  ["empty input renders nothing, not an empty tag", ["", "   ", null, undefined].every((v) => render(v) === "")],

  // --- helpers --------------------------------------------------------------
  ["reading time is never zero", readingMinutes("") === 1],
  ["200 words is one minute", readingMinutes("word ".repeat(200)) === 1],
  ["500 words is three minutes", readingMinutes("word ".repeat(500)) === 3],
  ['an unparseable date is empty, never "Invalid Date"', formatPostDate("not-a-date") === "" && formatPostDate("") === ""],
  ["a real date formats long", formatPostDate("2026-04-15") === "15 April 2026"],
  ["isoDate round-trips or empties", isoDate("nope") === "" && isoDate("2026-05-12") === "2026-05-12"],
  ["slugs are URL-encoded in hrefs", postHref("a b/c") === "/blog/a%20b%2Fc"],
  ["heading slugs strip punctuation", slugifyHeading("The 4Cs, simply") === "the-4cs-simply"],

  // --- table of contents ----------------------------------------------------
  ["every h2 gets an id", (dupes.html.match(/<h2 id="/g) ?? []).length === 2],
  ["duplicate headings get unique ids", dupes.toc[0].id !== dupes.toc[1].id],
  ["the toc lists both", dupes.toc.length === 2 && dupes.toc.every((t) => t.label === "Care")],
  ["a post with no headings has no toc", withHeadingIds(render("just words")).toc.length === 0],
];

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}
console.log(`\n${checks.length - failed} passed, ${failed} failed`);
if (failed) {
  console.error(
    "\n✗ journal renderer checks FAILED — this is the only place author text\n" +
      "  becomes HTML, and it carries no sanitiser because escaping precedes every\n" +
      "  rule. Fix lib/blog/markdown.ts rather than relaxing a check.",
  );
}
process.exit(failed ? 1 : 0);
