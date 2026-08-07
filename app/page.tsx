import Link from "next/link";
import { buttonVariants } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * Placeholder home page. The real homepage arrives with the storefront phase;
 * the foundation ships with the /design gallery that proves it.
 */
export default function HomePage() {
  return (
    <div className="mx-auto max-w-[var(--sz-container-narrow)] px-6 py-24 text-center">
      <div className="mb-4 inline-flex items-center gap-2.5">
        <span aria-hidden="true" className="size-2 rotate-45 bg-accent" />
        <span className="font-mono text-2xs uppercase tracking-[var(--sz-tracking-caps)] text-primary-700">
          Foundation
        </span>
      </div>
      <h1 className="text-3xl tracking-[var(--sz-tracking-tight)]">Ceremony is installed</h1>
      <p className="mx-auto mt-5 max-w-[52ch] text-md leading-[var(--sz-leading-relaxed)] text-body">
        The token layer, component library and shared shell are in place. Storefront pages are
        built on this foundation in the next phase.
      </p>
      <Link
        href="/design"
        className={cn(buttonVariants({ size: "lg" }), "mt-8 no-underline hover:no-underline")}
      >
        View the design system
      </Link>
    </div>
  );
}
