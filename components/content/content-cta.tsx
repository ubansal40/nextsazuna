import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ContentCta as ContentCtaData } from "@/lib/content-pages/types";
import { whatsappHref } from "@/lib/whatsapp";

/**
 * The "still have questions?" panel every content page closes with —
 * Sazuna Policy.dc.html §help CTA.
 *
 * Every one of these pages exists because someone had a question the catalog
 * did not answer, so each ends by offering the one channel the shop actually
 * replies on. The prefilled message is per page: a reader on the returns page
 * arrives in the thread already saying so.
 */
export function ContentCta({ cta, className }: { cta: ContentCtaData; className?: string }) {
  return (
    <div
      className={cn(
        "mt-14 flex flex-wrap items-center gap-4 rounded-[var(--sz-radius-xl)] bg-surface px-6 py-6",
        className,
      )}
    >
      <div className="min-w-[220px] flex-1">
        <p className="m-0 font-[family-name:var(--sz-font-display)] text-lg text-heading">
          {cta.heading}
        </p>
        <p className="m-0 mt-1.5 text-sm text-muted">{cta.body}</p>
      </div>
      <a
        href={whatsappHref(cta.whatsappText)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex flex-none items-center gap-2.5 rounded-[var(--sz-radius-btn-lg)] bg-primary-700 px-6 text-sm font-semibold text-white no-underline min-h-[50px] hover:bg-primary-800 hover:text-white hover:no-underline"
      >
        <Icon name="whatsapp" size={17} />
        {cta.buttonLabel}
      </a>
    </div>
  );
}
