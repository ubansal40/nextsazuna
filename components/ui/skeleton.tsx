import { cn } from "@/lib/cn";

export interface SkeletonProps {
  className?: string;
  /** Rounded to the pill radius — for avatars and chips. */
  circle?: boolean;
}

/**
 * Skeleton — loading placeholder with the spec's shimmer sweep.
 * Hidden from assistive tech: a live region announces the real content instead.
 */
export function Skeleton({ className, circle = false }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative block overflow-hidden bg-surface",
        circle ? "rounded-[var(--sz-radius-pill)]" : "rounded-[var(--sz-radius-sm)]",
        // The sweep is a translucent highlight that crosses the block.
        "before:absolute before:inset-y-0 before:-left-full before:w-full",
        "before:bg-gradient-to-r before:from-transparent before:via-[rgb(var(--sz-surface-raised-rgb)/.65)] before:to-transparent",
        "before:animate-shimmer",
        className,
      )}
    />
  );
}
