"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signInWithPassword, destroyAdminSession, currentAdmin } from "@/lib/admin/session";
import { landingPath } from "@/lib/admin/rbac";
import { loginMessage, type LoginOutcome } from "@/lib/admin/login-rules";
import { rateLimit, requestIp } from "@/lib/rate-limit";

/**
 * Admin auth actions.
 *
 * A Server Action is a public endpoint. Nothing the login form sends is
 * trusted: the credentials are re-checked in `signInWithPassword` and the
 * database lockout is the real cap. Both actions resolve rather than reject —
 * the form renders the returned message and a throw would blank the screen.
 */

export type SignInResult =
  | { ok: true; redirectTo: string }
  | { ok: false; kind: "invalid" | "locked" | "error"; message: string };

export async function adminSignIn(email: string, password: string): Promise<SignInResult> {
  /**
   * A supplementary per-IP speed bump in front of the account lockout — it
   * blunts an address spraying many different admin emails, which the
   * per-account counter cannot see. It is per-process and resets on deploy, so
   * it is exactly that: a bump, not the boundary. Ten tries per fifteen minutes
   * is well clear of an operator mistyping a couple of times.
   */
  const ip = requestIp(await headers());
  if (!rateLimit(`admin-login:${ip}`, { limit: 10, windowMs: 15 * 60_000 }).ok) {
    return { ok: false, kind: "locked", message: loginMessage("locked") };
  }

  const { outcome, context } = await signInWithPassword(email, password);

  if (outcome === "ok" && context) {
    return { ok: true, redirectTo: landingPath(context) };
  }
  // `error` collapses to the invalid banner for the operator — the detail is in
  // the server log. `locked` gets its own banner (see the login form).
  const kind: LoginOutcome = outcome;
  return {
    ok: false,
    kind: kind === "locked" ? "locked" : "invalid",
    message: loginMessage(kind),
  };
}

export async function adminSignOut(): Promise<void> {
  await destroyAdminSession();
  redirect("/admin/login");
}

/**
 * Resolve where an already-signed-in admin should be sent from the login page.
 * Returns null when nobody is signed in. Kept here so the login page reads the
 * session through one place rather than importing the session module directly.
 */
export async function signedInLanding(): Promise<string | null> {
  const admin = await currentAdmin();
  return admin ? landingPath(admin) : null;
}
