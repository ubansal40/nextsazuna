import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Badge — spec §Component · Badge & chip.
 *
 * Status and merchandising labels. `tone` carries meaning, so pick by meaning
 * (stock state, sale) rather than by the colour you happen to want.
 */
const badge = cva(
  "inline-flex items-center gap-1.5 rounded-[var(--sz-radius-pill)] whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "bg-surface text-muted",
        inStock: "bg-success-soft text-success",
        lowStock: "bg-warning-soft text-warning",
        outOfStock: "bg-surface text-muted",
        sale: "bg-primary-700 text-white",
        info: "bg-info-soft text-info",
        error: "bg-error-soft text-error",
        accent: "bg-accent-soft text-accent-strong",
        outline: "bg-transparent text-primary-700 border border-primary-200",
      },
      size: {
        sm: "text-2xs px-2.5 py-1",
        md: "text-xs px-3 py-1.5",
      },
      /** Mono + wide caps — the certification/eyebrow treatment. */
      mono: {
        true: "font-mono uppercase tracking-[var(--sz-tracking-caps)]",
        false: "",
      },
    },
    defaultVariants: { tone: "neutral", size: "md", mono: false },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badge> {
  children: ReactNode;
}

export function Badge({ className, tone, size, mono, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badge({ tone, size, mono }), className)} {...props}>
      {children}
    </span>
  );
}

export { badge as badgeVariants };
