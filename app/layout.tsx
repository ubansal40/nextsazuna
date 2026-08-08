import type { Metadata } from "next";
import { fontVariables } from "@/lib/fonts";
import { getAnnouncementBar, getWhatsAppHref } from "@/lib/content";
import { SiteFooter, SiteHeader, WhatsAppButton } from "@/components/shell";
import { SiteSchema } from "@/components/shell/site-schema";
import { staticOrigin } from "@/lib/site-url";
import { ToastProvider } from "@/components/ui";
import "./globals.css";

export const metadata: Metadata = {
  /**
   * Every page sets a relative `alternates.canonical`. Without a base, Next
   * emits them relative and logs a warning; with one, they resolve to absolute
   * URLs, which is what a canonical has to be to mean anything.
   */
  metadataBase: new URL(staticOrigin()),
  title: {
    default: "Sazuna Jewellers",
    template: "%s · Sazuna Jewellers",
  },
  description:
    "Certified diamond and gold jewellery. Every Sazuna diamond is graded by SGL and travels with its certificate.",
};

/**
 * Root layout. The shared shell is mounted here exactly once — per the project
 * design rules, no page may render its own header, footer or WhatsApp button.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Both are admin-editable content blocks. Fetched in parallel because the
  // layout blocks every page render until they resolve.
  const [announcement, whatsappHref] = await Promise.all([
    getAnnouncementBar(),
    getWhatsAppHref(),
  ]);

  return (
    <html lang="en" className={fontVariables}>
      <body>
        <ToastProvider>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[300] focus:rounded-[var(--sz-radius-control)] focus:bg-primary-700 focus:px-4 focus:py-2 focus:text-white focus:no-underline"
          >
            Skip to content
          </a>
          <SiteHeader announcement={announcement} whatsappHref={whatsappHref} />
          <main id="main">{children}</main>
          {/* Site-wide, because /about and /stores reference these nodes by @id. */}
          <SiteSchema origin={staticOrigin()} />
          <SiteFooter />
          {whatsappHref && <WhatsAppButton href={whatsappHref} />}
        </ToastProvider>
      </body>
    </html>
  );
}
