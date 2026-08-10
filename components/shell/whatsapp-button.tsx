"use client";

import { Icon, useFooterVisible } from "@/components/ui";

/**
 * Floating WhatsApp pill — spec §Floating WhatsApp (SazunaHeader.dc.html:189-192).
 *
 * Mounted once by the root layout, never per page. Green is WhatsApp's own
 * brand colour and deliberately sits outside the Ceremony palette — the point
 * of the affordance is that it is recognisably WhatsApp.
 *
 * The label is ink, not white: white on #25D366 measures 1.98:1, nowhere near
 * the 4.5:1 AA needs, and the pill colour is the part that has to stay brand.
 * Ink on that green is 9.15:1, and 7.4:1 on the hover shade.
 *
 * The glow hangs on a pseudo-element for a cascade reason. `shadow-whatsapp` is
 * a utility, and utilities outrank the base-layer `:focus-visible` rule that
 * paints the global ring with `box-shadow` — so a static shadow on this element
 * meant it had no visible focus state at all. The pseudo keeps the glow and
 * leaves the anchor's own box-shadow free for the ring.
 *
 * It stands down once the footer is on screen. The two specs both pin content
 * to the bottom-right — this pill and the footer's payment marks — so without
 * that rule the pill covers them for as long as the reader is in the footer.
 */
export function WhatsAppButton({ href }: { href: string }) {
  if (useFooterVisible()) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat on WhatsApp"
      className="fixed bottom-6 right-6 z-[75] inline-flex items-center gap-2.5 rounded-pill bg-whatsapp py-3 pl-[14px] pr-[18px] text-sm font-semibold text-heading no-underline transition-colors duration-[var(--sz-dur-fast)] before:absolute before:inset-0 before:rounded-pill before:shadow-whatsapp before:content-[''] hover:bg-whatsapp-hover hover:text-heading hover:no-underline"
    >
      <Icon name="whatsapp-chat" size={22} />
      WhatsApp
    </a>
  );
}
