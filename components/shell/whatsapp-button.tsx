import { Icon } from "@/components/ui";

/**
 * Floating WhatsApp affordance — spec §Global shell. Rendered once by the root
 * layout, never per page.
 */
export function WhatsAppButton({ phone = "9779800000000" }: { phone?: string }) {
  return (
    <a
      href={`https://wa.me/${phone}`}
      target="_blank"
      rel="noreferrer noopener"
      aria-label="Ask on WhatsApp"
      className="fixed bottom-6 left-6 z-50 inline-flex items-center gap-2.5 rounded-[var(--sz-radius-pill)] border border-line bg-raised py-2.5 pl-3 pr-4 text-sm font-semibold text-body no-underline shadow-md transition-[transform,box-shadow] duration-[var(--sz-dur)] ease-[var(--sz-ease-out)] hover:-translate-y-0.5 hover:shadow-lg hover:no-underline"
    >
      <span className="inline-flex size-7 items-center justify-center rounded-[var(--sz-radius-pill)] bg-success text-white">
        <Icon name="whatsapp" size={16} />
      </span>
      <span className="hidden sm:inline">Ask on WhatsApp</span>
    </a>
  );
}
