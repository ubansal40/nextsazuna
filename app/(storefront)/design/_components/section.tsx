import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Section shell matching the spec's own rhythm, so the two can be compared. */
export function Section({
  eyebrow,
  title,
  intro,
  id,
  children,
}: {
  eyebrow: string;
  title: string;
  intro?: string;
  id: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-line pt-16 pb-2">
      <div className="mb-3.5 flex items-center gap-2.5">
        <span aria-hidden="true" className="size-2 rotate-45 bg-accent" />
        <span className="text-xs font-semibold uppercase tracking-[var(--sz-tracking-caps)] text-primary-700">
          {eyebrow}
        </span>
      </div>
      <h2 className="text-2xl tracking-[-.01em]">{title}</h2>
      {intro && (
        <p className="mt-3 max-w-[64ch] text-base leading-[var(--sz-leading-relaxed)] text-body">
          {intro}
        </p>
      )}
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** Bordered panel with a mono caps label — the spec's demo container. */
export function Panel({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-[var(--sz-radius-lg)] border border-line bg-raised p-7", className)}>
      <p className="mb-[18px] font-mono text-2xs uppercase tracking-[var(--sz-tracking-caps)] text-muted">
        {label}
      </p>
      {children}
    </div>
  );
}

export function Divider() {
  return <div className="my-[26px] h-px bg-line-soft" />;
}
