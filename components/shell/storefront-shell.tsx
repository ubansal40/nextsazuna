import { currentCustomer } from "@/lib/auth/session";
import { getAnnouncementBar, getWhatsAppHref } from "@/lib/content";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import { SiteSchema } from "./site-schema";
import { WhatsAppButton } from "./whatsapp-button";
import { staticOrigin } from "@/lib/site-url";
import { ToastProvider } from "@/components/ui";

/**
 * The storefront chrome — header, footer, JSON-LD, WhatsApp button.
 *
 * THE definition of the shared shell. It exists as a component rather than
 * living directly in the storefront layout because it has to be mounted in two
 * places that are not parent and child:
 *
 *   - `app/(storefront)/layout.tsx`, for every customer-facing route
 *   - `app/not-found.tsx`, for a URL that matches no route at all
 *
 * That second one is the reason. A root `not-found.tsx` renders inside the
 * *root* layout, which is now only `<html>` and `<body>` — so without this, a
 * mistyped URL fell back to Next's stock black-and-white 404 with no header,
 * no footer and no way back into the shop. Extracting the chrome keeps one
 * definition and satisfies the rule that the shell is never rebuilt.
 */
export async function StorefrontShell({ children }: { children: React.ReactNode }) {
  /**
   * Fetched in parallel because this blocks every page render until it
   * resolves. The session read is what lets the header know who it is talking
   * to, and it is here rather than per page so a customer signed in on the PDP
   * is signed in in the header too.
   */
  const [announcement, whatsappHref, signedIn] = await Promise.all([
    getAnnouncementBar(),
    getWhatsAppHref(),
    currentCustomer(),
  ]);

  /**
   * Only what the header draws. Nothing else about the customer belongs in a
   * client component's props, and `notes` in particular must never leave the
   * server.
   *
   * Loyalty points are withheld while the scheme is off — `loyalty_config` is
   * seeded disabled and the ledger is only written when an admin bills an
   * order, so a number here would be a promise the shop is not yet keeping.
   */
  const customer = signedIn ? { name: signedIn.name?.trim() || "there" } : undefined;

  return (
    <ToastProvider>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[300] focus:rounded-[var(--sz-radius-control)] focus:bg-primary-700 focus:px-4 focus:py-2 focus:text-white focus:no-underline"
      >
        Skip to content
      </a>
      <SiteHeader announcement={announcement} whatsappHref={whatsappHref} customer={customer} />
      <main id="main">{children}</main>
      {/* Site-wide, because /about and /stores reference these nodes by @id. */}
      <SiteSchema origin={staticOrigin()} />
      <SiteFooter />
      {whatsappHref && <WhatsAppButton href={whatsappHref} />}
    </ToastProvider>
  );
}
