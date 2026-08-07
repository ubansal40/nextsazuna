import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";

export interface AccordionItem {
  id: string;
  question: ReactNode;
  answer: ReactNode;
}

export interface AccordionProps {
  items: AccordionItem[];
  /** Only one panel open at a time. Native single-select via a shared name. */
  exclusive?: boolean;
  /**
   * `compact` is the FAQ treatment. `section` is the PDP's: a display-face
   * heading on a taller row, for panels that carry a page section rather than a
   * question.
   */
  variant?: "compact" | "section";
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
  variant = "compact",
  defaultOpen = [],
  className,
}: AccordionProps) {
  const section = variant === "section";

  return (
    <div className={cn("divide-y divide-line border-y border-line", className)}>
      {items.map((item) => (
        <details
          key={item.id}
          name={exclusive ? "sz-accordion" : undefined}
          open={defaultOpen.includes(item.id)}
          className="group"
        >
          <summary
            className={cn(
              "flex cursor-pointer list-none items-center justify-between marker:hidden [&::-webkit-details-marker]:hidden",
              "transition-colors duration-[var(--sz-dur-fast)]",
              section
                ? "gap-4 px-0.5 py-5 font-[family-name:var(--sz-font-display)] text-accordion font-medium text-heading"
                : "gap-4 py-4 text-sm font-semibold text-body hover:text-primary-700",
            )}
          >
            {item.question}
            <Icon
              name="chevron-down"
              size={18}
              strokeWidth={section ? 1.9 : undefined}
              className={cn(
                "shrink-0 transition-transform duration-[var(--sz-dur-condense)] ease-[var(--sz-ease-out)] group-open:rotate-180",
                section ? "text-primary-700" : "text-muted",
              )}
            />
          </summary>
          <div
            className={cn(
              section
                ? "px-0.5 pb-[22px] text-prose leading-[1.65] text-muted"
                : "pb-4 text-sm leading-[var(--sz-leading-relaxed)] text-body",
            )}
          >
            {item.answer}
          </div>
        </details>
      ))}
    </div>
  );
}
