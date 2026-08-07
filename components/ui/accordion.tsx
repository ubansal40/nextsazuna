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
  className?: string;
}

/**
 * Accordion — used by FAQs and the PDP detail panels.
 *
 * Native <details>/<summary>, so it works without JavaScript, is keyboard and
 * screen-reader correct out of the box, and stays a Server Component.
 */
export function Accordion({ items, exclusive = false, className }: AccordionProps) {
  return (
    <div className={cn("divide-y divide-line border-y border-line", className)}>
      {items.map((item) => (
        <details key={item.id} name={exclusive ? "sz-accordion" : undefined} className="group">
          <summary
            className={cn(
              "flex items-center justify-between gap-4 cursor-pointer list-none py-4",
              "text-sm font-semibold text-body marker:hidden [&::-webkit-details-marker]:hidden",
              "transition-colors duration-[var(--sz-dur-fast)] hover:text-primary-700",
            )}
          >
            {item.question}
            <Icon
              name="chevron-down"
              size={18}
              className="text-muted transition-transform duration-[var(--sz-dur)] ease-[var(--sz-ease-out)] group-open:rotate-180"
            />
          </summary>
          <div className="pb-4 text-sm leading-[var(--sz-leading-relaxed)] text-body">
            {item.answer}
          </div>
        </details>
      ))}
    </div>
  );
}
