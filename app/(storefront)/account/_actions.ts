"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requestCode, verifyCode } from "@/lib/auth/otp";
import { createSession, destroySession } from "@/lib/auth/session";
import { normalisePhone } from "@/lib/order-lookup";
import { rateLimit, requestIp } from "@/lib/rate-limit";

/**
 * Sign-in actions.
 *
 * A Server Action is a public endpoint, so nothing the client sends is trusted:
 * the phone is re-normalised here and the code is re-checked against the
 * database regardless of what the panel did.
 *
 * Both actions **resolve rather than reject**, always. `AccountMenu` advances
 * to the code step as soon as `onRequestCode` settles and does nothing with a
 * rejection, so a thrown error would strand the customer on a screen with no
 * explanation. Failure is a value here, not an exception.
 */

export type RequestCodeResult =
  | { ok: true; devCode?: string }
  | { ok: false; error: "invalid" | "throttled" | "undeliverable" | "failed" };

export type SubmitCodeResult =
  | { ok: true }
  | { ok: false; error: "invalid" | "wrong-code" | "locked-out" | "failed" };

export async function requestSignInCode(identity: string): Promise<RequestCodeResult> {
  const phone = normalisePhone(identity);
  if (phone.length !== 10) return { ok: false, error: "invalid" };

  const ip = requestIp(await headers());

  /**
   * Two buckets, as the guest order lookup does. The per-phone limits that
   * matter — a 60s cooldown and six sends an hour — live in SQL where they are
   * shared state; this one only blunts a single address cycling many numbers,
   * and is per-process, so it is a speed bump rather than a control.
   */
  for (const key of [`otp:ip:${ip}`, `otp:phone:${phone}`]) {
    if (!rateLimit(key, { limit: 5, windowMs: 10 * 60_000 }).ok) {
      return { ok: false, error: "throttled" };
    }
  }

  try {
    const result = await requestCode(phone);
    if (result.outcome === "throttled") return { ok: false, error: "throttled" };
    if (result.outcome === "undeliverable") return { ok: false, error: "undeliverable" };
    // Only ever set on a developer's machine with no gateway — see
    // devCodeAllowed in lib/auth/otp.ts.
    return { ok: true, devCode: result.devCode };
  } catch (error) {
    // The detail belongs in the server log. The reference returns the raw
    // message from its unauthenticated auth routes, so a driver error there
    // hands schema names to anonymous callers and the login page prints them.
    console.error("[account] requesting a code failed", error);
    return { ok: false, error: "failed" };
  }
}

export async function submitSignInCode(
  identity: string,
  code: string,
): Promise<SubmitCodeResult> {
  const phone = normalisePhone(identity);
  if (phone.length !== 10 || !code.trim()) return { ok: false, error: "invalid" };

  const ip = requestIp(await headers());
  if (!rateLimit(`otp-verify:ip:${ip}`, { limit: 15, windowMs: 10 * 60_000 }).ok) {
    return { ok: false, error: "locked-out" };
  }

  try {
    const result = await verifyCode(phone, code);

    if (result.outcome === "locked-out") return { ok: false, error: "locked-out" };
    // "unknown-code" — expired, already used, or never issued — is reported as
    // a wrong code. Distinguishing them would say whether a live code exists
    // for that number.
    if (result.outcome !== "ok" || !result.customer) {
      return { ok: false, error: "wrong-code" };
    }

    await createSession(result.customer.id);

    // The header renders from the session, so every cached segment that shows
    // it has to be rebuilt before the panel can flip to the signed-in view.
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    console.error("[account] verifying a code failed", error);
    return { ok: false, error: "failed" };
  }
}

export async function signOut(): Promise<void> {
  try {
    await destroySession();
  } catch (error) {
    console.error("[account] sign out failed", error);
  }
  revalidatePath("/", "layout");
}
