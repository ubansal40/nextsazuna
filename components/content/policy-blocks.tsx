import { Accordion, Icon, ProseTable } from "@/components/ui";
import type { PolicyBlock } from "@/lib/content-pages/types";
import { renderInline } from "./inline";

/**
 * The block switch for Sazuna Policy.dc.html.
 *
 * A Server Component: policy copy is compiled into the bundle as data and never
 * changes after render, so none of this needs to reach the browser.
 *
 * Paragraphs, headings and lists carry no classes of their own — the surrounding
 * <Prose> styles them by descendant, which is what keeps eleven pages from each
 * hand-classing their own body copy.
 */
export function PolicyBlocks({ blocks }: { blocks: PolicyBlock[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        switch (block.type) {
          case "p":
            return <p key={index}>{renderInline(block.text)}</p>;

          case "h3":
            return <h3 key={index}>{renderInline(block.text)}</h3>;

          case "ul":
            return (
              <ul key={index}>
                {block.items.map((item, i) => (
                  <li key={i}>{renderInline(item)}</li>
                ))}
              </ul>
            );

          case "ol":
            // Numbered because the order is the instruction — these are the
            // four steps of a return, not an unordered set of options.
            return (
              <ol
                key={index}
                className="m-0 mb-4 list-decimal ps-[var(--sz-prose-indent)] text-base leading-relaxed text-body"
              >
                {block.items.map((item, i) => (
                  <li key={i} className="mb-[var(--sz-prose-gap-tight)]">
                    {renderInline(item)}
                  </li>
                ))}
              </ol>
            );

          case "table":
            return (
              <ProseTable
                key={index}
                head={block.head.map((cell) => renderInline(cell))}
                rows={block.rows.map((row) => row.map((cell) => renderInline(cell)))}
              />
            );

          case "callout":
            return (
              <div
                key={index}
                className="my-4 flex gap-3 rounded-[var(--sz-radius-md)] border border-info-soft bg-info-soft px-4 py-3.5"
              >
                <Icon
                  name="info"
                  size={18}
                  className="mt-0.5 shrink-0 text-info"
                />
                <p className="text-sm leading-relaxed">{renderInline(block.text)}</p>
              </div>
            );

          case "quote":
            return (
              <blockquote
                key={index}
                className="my-5 border-s-2 border-accent ps-4 font-[family-name:var(--sz-font-display)] text-content-h2 font-normal text-heading italic"
              >
                {renderInline(block.text)}
              </blockquote>
            );

          case "note":
            return (
              <p key={index} className="text-trust leading-relaxed text-muted">
                {renderInline(block.text)}
              </p>
            );

          case "faq":
            return (
              <Accordion
                key={index}
                variant="card"
                className="my-4"
                items={block.items.map((item) => ({
                  id: item.id,
                  question: item.question,
                  answer: <p className="m-0 max-w-[64ch]">{renderInline(item.answer)}</p>,
                }))}
              />
            );
        }
      })}
    </>
  );
}
