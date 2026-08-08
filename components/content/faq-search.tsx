"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui";
import { whatsappHref } from "@/lib/whatsapp";

/**
 * FAQ search — Sazuna Policy.dc.html §FAQ.
 *
 * Filters the questions the server already rendered rather than holding them
 * itself. Every panel is in the HTML with a pre-lowercased `data-faq-search`
 * attribute; this toggles `hidden` on the ones that miss. Two things fall out of
 * that: the accordion stays a Server Component with real <details> elements, and
 * the answers are not shipped a second time in the RSC payload.
 *
 * It is also a genuine enhancement rather than a requirement — with JavaScript
 * off, the input is inert and all twelve questions are still there to read.
 *
 * The filtering runs in the change handler, not an effect. React has nothing to
 * re-render here, so an effect would only add a frame between typing and the
 * list settling.
 */

export const FAQ_LIST_ID = "faq-topics";
/** Set on each <details>, holding its question and answer, already lowercased. */
export const FAQ_SEARCH_ATTR = "data-faq-search";

export function FaqSearch({ resultCount }: { resultCount: number }) {
  const [query, setQuery] = useState("");
  const [misses, setMisses] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  /**
   * Open the panel a deep link points at.
   *
   * The old storefront's FAQ ids are still in circulation — /faqs.html#is-cod-
   * really-available and the like — and landing on a question that is still
   * collapsed looks like a broken link. Browsers only auto-expand a <details>
   * when the fragment targets something *inside* it, and here the id is on the
   * element itself, so it takes a nudge.
   */
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    const target = document.getElementById(id);
    if (target instanceof HTMLDetailsElement) {
      target.open = true;
      target.scrollIntoView({ block: "start", behavior: "instant" });
    }
  }, []);

  function apply(value: string) {
    setQuery(value);

    const root = document.getElementById(FAQ_LIST_ID);
    if (!root) return;

    const needle = value.trim().toLowerCase();
    let hits = 0;

    for (const topic of root.querySelectorAll<HTMLElement>("[data-faq-topic]")) {
      let shown = 0;

      for (const item of topic.querySelectorAll<HTMLDetailsElement>("[data-faq-search]")) {
        const hit = !needle || (item.getAttribute(FAQ_SEARCH_ATTR) ?? "").includes(needle);
        item.hidden = !hit;
        // A hit that stays collapsed hides the very text that matched, so
        // searching opens what it finds — and clearing puts them all away again.
        item.open = hit && needle.length > 0;
        if (hit) shown += 1;
      }

      // A topic heading with nothing under it reads as an empty category.
      topic.hidden = shown === 0;
      hits += shown;
    }

    setMisses(hits === 0);
  }

  function clear() {
    apply("");
    input.current?.focus();
  }

  return (
    <>
      <div className="relative mt-6 flex max-w-[var(--sz-prose-max)] items-center">
        <Icon
          name="search"
          size={17}
          className="pointer-events-none absolute start-3.5 text-muted-soft"
        />
        <input
          ref={input}
          type="search"
          value={query}
          onChange={(event) => apply(event.target.value)}
          aria-label="Search FAQs"
          aria-describedby="faq-result-count"
          placeholder="Search questions"
          className="w-full rounded-[var(--sz-radius-md)] border border-line bg-raised ps-11 pe-4 text-control text-heading outline-none min-h-[52px] transition-[border-color,box-shadow] duration-[var(--sz-dur)] ease-[var(--sz-ease-out)] focus-visible:border-accent focus-visible:shadow-[var(--sz-ring-focus-soft)]"
        />
      </div>

      {/* Announced, not drawn: a sighted reader sees the list shrink. */}
      <p id="faq-result-count" role="status" aria-live="polite" className="sr-only">
        {query.trim()
          ? `${misses ? 0 : "Some"} of ${resultCount} questions match ${query.trim()}`
          : `${resultCount} questions`}
      </p>

      {misses && (
        <div className="mt-5 max-w-[var(--sz-prose-max)] rounded-[var(--sz-radius-xl)] border border-dashed border-content-dashed bg-raised px-6 py-16 text-center">
          <span aria-hidden className="inline-flex items-center justify-center gap-2.5">
            <span className="size-3 rotate-45 bg-line" />
            <span className="size-[19px] rotate-45 bg-accent opacity-60" />
            <span className="size-3 rotate-45 bg-line" />
          </span>
          <p className="m-0 mt-5 font-[family-name:var(--sz-font-display)] text-modal-title font-medium text-heading">
            No answers for “{query.trim()}”
          </p>
          <p className="mx-auto mt-2.5 max-w-[40ch] text-sm leading-relaxed text-muted">
            Try a different word, or ask us directly — we usually reply within the hour.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={clear}
              className="inline-flex items-center justify-center rounded-[var(--sz-radius-btn-lg)] border border-line bg-raised px-5 text-sm font-semibold text-primary-700 min-h-[46px] hover:border-primary-700"
            >
              Clear search
            </button>
            <a
              href={whatsappHref("Hi, I have a question.")}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-[var(--sz-radius-btn-lg)] bg-primary-700 px-5 text-sm font-semibold text-white no-underline min-h-[46px] hover:bg-primary-800 hover:text-white hover:no-underline"
            >
              <Icon name="whatsapp" size={16} />
              WhatsApp us
            </a>
          </div>
        </div>
      )}
    </>
  );
}
