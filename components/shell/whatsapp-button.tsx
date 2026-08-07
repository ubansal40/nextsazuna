import { Icon } from "@/components/ui";

/**
 * Floating WhatsApp pill — spec §Floating WhatsApp (SazunaHeader.dc.html:189-192).
 *
 * Mounted once by the root layout, never per page. Green is WhatsApp's own
 * brand colour and deliberately sits outside the Ceremony palette — the point
 * of the affordance is that it is recognisably WhatsApp.
 */
export function WhatsAppButton({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat on WhatsApp"
      className="fixed bottom-6 right-6 z-[75] inline-flex items-center gap-2.5 rounded-pill bg-whatsapp py-3 pl-[14px] pr-[18px] text-sm font-semibold text-white no-underline shadow-whatsapp transition-colors duration-[var(--sz-dur-fast)] hover:bg-whatsapp-hover hover:text-white hover:no-underline"
    >
      <Icon name="whatsapp-chat" size={22} />
      WhatsApp
    </a>
  );
}
