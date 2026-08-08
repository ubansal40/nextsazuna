import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";

export interface AccordionItem {
  id: string;
  question: ReactNode;
  answer: ReactNode;
  /**
   * Extra data-* attributes for the <details>. The FAQ hangs a lowercased
   * search key here so its filter can match without the copy being shipped to
   * the browser a second time.
   */
  data?: Record<`data-${string}`, string>;
}

export interface AccordionProps {
  items: AccordionItem[];
  /** Only one panel open at a time. Native single-select via a shared name. */
  exclusive?: boolean;
  /**
   * The name that binds an exclusive group together.
   *
   * Browsers scope `<details name>` to the document, not to the parent element,
   * so two exclusive accordions on one page interlock unless they are named
   * apart — opening a question under "Shipping" would close one under "Care".
   * The FAQ page renders five groups, so it passes a name per topic.
   */
  group?: string;
  /**
   * `compact` is the bare list. `section` is the PDP's: a display-face heading
   * on a taller row, for panels carrying a page section rather than a question.
   * `card` is the FAQ's, which sits inside a bordered panel and so needs its own
   * horizontal padding — Sazuna Policy.dc.html §FAQ.
   */
  variant?: "compact" | "section" | "card";
  /** Ids that start open. */
  defaultOpen?: string[];
  className?: string;
}

/**
 * Accordion — used by FAQs and the PDP detail panels.
 *
 * Native <details>/<summary>, so it works without JavaScript, is keyboard and
 * screen-reader correct out of the box, and stays a Server Component.
 */
export function Accordion({
  items,
  exclusive = false,
  group = "sz-accordion",
  variant = "compact",
  defaultOpen = [],
  className,
}: AccordionProps) {
  const section = variant === "section";
  const card = variant === "card";

  const summaryClass = {
    section:
      "gap-4 px-0.5 py-5 font-[family-name:var(--sz-font-display)] text-accordion font-medium text-heading",
    card: "gap-3.5 px-[18px] py-[17px] text-control font-semibold text-heading hover:text-primary-700",
    compact: "gap-4 py-4 text-sm font-semibold text-body hover:text-primary-700",
  }[variant];

  const answerClass = {
    section: "px-0.5 pb-[22px] text-prose leading-[1.65] text-muted",
    card: "px-[18px] pb-[18px] text-prose leading-[1.65] text-muted",
    compact: "pb-4 text-sm leading-[var(--sz-leading-relaxed)] text-body",
  }[variant];

  return (
    <div
      className={cn(
        // The card draws its own frame and rules between rows. `~` rather than
        // `+` so a filtered-out row does not leave a divider stranded above the
        // next visible one.
        card
          ? "overflow-hidden rounded-[var(--sz-radius-lg)] border border-line bg-raised [&>*:not([hidden])~*:not([hidden])]:border-t [&>*:not([hidden])~*:not([hidden])]:border-line-soft"
          : "divide-y divide-line border-y border-line",
        className,
      )}
    >
      {items.map((item) => (
        <details
          key={item.id}
          id={item.id}
          name={exclusive ? group : undefined}
          open={defaultOpen.includes(item.id)}
          className="group"
          {...item.data}
        >
          <summary
            className={cn(
              "flex cursor-pointer list-none items-center justify-between marker:hidden [&::-webkit-details-marker]:hidden",
              "transition-colors duration-[var(--sz-dur-fast)]",
              summaryClass,
            )}
          >
            {item.question}
            <Icon
              name="chevron-down"
              size={section ? 18 : 17}
              strokeWidth={section ? 1.9 : undefined}
              className={cn(
                "shrink-0 transition-transform duration-[var(--sz-dur-condense)] ease-[var(--sz-ease-out)] group-open:rotate-180",
                section || card ? "text-primary-700" : "text-muted",
              )}
            />
          </summary>
          <div className={answerClass}>{item.answer}</div>
        </details>
      ))}
    </div>
  );
}
