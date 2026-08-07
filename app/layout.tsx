import type { Metadata } from "next";
import { fontVariables } from "@/lib/fonts";
import { SiteFooter, SiteHeader, WhatsAppButton } from "@/components/shell";
import { ToastProvider } from "@/components/ui";
import "./globals.css";

export const metadata: Metadata = {
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
export default function RootLayout({ children }: { children: React.ReactNode }) {
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
          <SiteHeader />
          <main id="main">{children}</main>
          <SiteFooter />
          <WhatsAppButton />
        </ToastProvider>
      </body>
    </html>
  );
}
