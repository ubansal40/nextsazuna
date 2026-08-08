import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { signedInLanding } from "../_actions";
import { AdminLoginForm } from "./_components/login-form";

/**
 * Admin sign-in — Sazuna Admin.dc.html §Login.
 *
 * Outside the guarded admin shell — the one admin route a signed-out person must
 * reach. It renders against the bare document layout, so it carries neither the
 * storefront chrome nor the admin sidebar: the logo, the card, and nothing else.
 *
 * Built to the spec's login: the wordmark logo over a gold "ADMIN CONSOLE"
 * eyebrow, a radial wash on the console canvas, and the 396px card. The mock's
 * two-factor step and "Forgot password?" link are deliberately absent — there is
 * no TOTP backend and no email reset; a password is (re)set with
 * `npm run admin:create`.
 *
 * An admin who is already signed in has no reason to see this, so they are sent
 * straight to wherever they belong.
 */

export const metadata: Metadata = {
  title: "Admin sign-in",
  // The admin must never be indexed, linked from a sitemap, or followed into.
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage() {
  const landing = await signedInLanding();
  if (landing) redirect(landing);

  return (
    <main className="grid min-h-dvh place-items-center bg-admin-canvas px-6 py-12 [background-image:radial-gradient(80%_60%_at_50%_-10%,var(--sz-surface),transparent)]">
      <div className="w-full max-w-[396px]">
        <div className="mb-5 text-center">
          <Image
            src="/sazuna-logo.webp"
            alt="Sazuna Jewellers"
            width={1130}
            height={240}
            priority
            className="mx-auto block h-8 w-auto"
          />
          <p className="mt-2.5 font-mono text-[10px] uppercase tracking-[0.26em] text-accent-strong">
            Admin Console
          </p>
        </div>

        <div className="rounded-[var(--sz-admin-radius-login)] border border-line bg-raised px-6 py-[26px] shadow-[var(--sz-admin-shadow-card)]">
          <h1 className="font-display text-[21px] font-medium leading-tight text-heading">Sign in</h1>
          <p className="mt-1 text-[12.5px] text-muted">Staff access only.</p>
          <AdminLoginForm />
        </div>

        <p className="mt-4 text-center font-mono text-[10px] text-accent-strong">
          Sazuna Jewellers · Staff Portal
        </p>
      </div>
    </main>
  );
}
