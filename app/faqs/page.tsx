import type { Metadata } from "next";
import { Accordion } from "@/components/ui";
import { ContentCta } from "@/components/content/content-cta";
import { FAQ_LIST_ID, FaqSearch } from "@/components/content/faq-search";
import { renderInline } from "@/components/content/inline";
import { ContentHeader, policyContainer } from "@/components/content/policy-page";
import { faqs } from "@/lib/content-pages/policy/faqs";

/**
 * FAQs — Sazuna Policy.dc.html §FAQ.
 *
 * The same page furniture as a policy — header, closing panel — but the spec
 * gives this variant a search box instead of a table of contents, and topic
 * cards instead of prose.
 *
 * Panels are not exclusive: the spec keeps an open/closed flag per question, so
 * a reader comparing two answers can hold both open.
 */

export const metadata: Metadata = {
  title: "FAQs",
  description:
    "Common questions about sizing, shipping, returns, certification, and care for Sazuna Jewellers diamond, silver, and gold-plated pieces.",
  alternates: { canonical: "/faqs" },
};

const questionCount = faqs.topics.reduce((total, topic) => total + topic.items.length, 0);

/**
 * FAQPage structured data, built from the same source as the visible copy so
 * the two cannot drift. Answers are flattened to plain text — the inline link
 * notation is presentation, and Google wants the prose.
 */
const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.topics.flatMap((topic) =>
    topic.items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: plainText(item.answer) },
    })),
  ),
};

/** Strips the `**bold**` and `[label](href)` notation back to reading text. */
function plainText(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s*→\s*$/, "")
    .trim();
}

export default function FaqsPage() {
  return (
    <div className={policyContainer}>
      <script
        type="application/ld+json"
        // Serialised from a literal built above, not from user input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <ContentHeader kicker={faqs.kicker} title={faqs.title} updated={faqs.updated}>
        <FaqSearch resultCount={questionCount} />
      </ContentHeader>

      <div id={FAQ_LIST_ID} className="max-w-[var(--sz-prose-max)]">
        {faqs.topics.map((topic) => (
          <section key={topic.id} data-faq-topic className="mt-7">
            <h2 className="m-0 mb-2.5 font-mono text-badge uppercase tracking-[var(--sz-tracking-caps)] text-accent-strong">
              {topic.title}
            </h2>
            <Accordion
              variant="card"
              items={topic.items.map((item) => ({
                id: item.id,
                question: item.question,
                answer: <p className="m-0 max-w-[64ch]">{renderInline(item.answer)}</p>,
                // Lowercased here so the filter never has to case-fold on input.
                data: { "data-faq-search": `${item.question} ${plainText(item.answer)}`.toLowerCase() },
              }))}
            />
          </section>
        ))}
      </div>

      <ContentCta cta={faqs.cta} className="max-w-[var(--sz-prose-max)]" />
    </div>
  );
}
