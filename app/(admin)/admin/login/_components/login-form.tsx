"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { adminSignIn, type SignInResult } from "../../_actions";

/**
 * Admin login form — Sazuna Admin.dc.html §Login.
 *
 * The action returns a value, never throws — a failed sign-in shows a banner and
 * a successful one navigates. `router.replace`, not `push`: the login page must
 * not sit in history behind the admin, where Back would bounce a signed-in
 * operator forward again. `router.refresh()` makes the destination re-read the
 * freshly-set session cookie on the server.
 *
 * The fields are styled directly to the spec (44px controls, the console's own
 * radius) rather than through the storefront Input primitive — the login is a
 * bespoke screen, and the shared admin form controls come with the data screens.
 */

type Failure = Extract<SignInResult, { ok: false }>;

const field = (invalid: boolean) =>
  cn(
    "w-full min-h-11 rounded-[var(--sz-admin-radius-control)] border bg-raised px-[13px]",
    "text-[13px] text-body placeholder:text-muted outline-none",
    "transition-[border-color,box-shadow] duration-[var(--sz-dur)] ease-[var(--sz-ease-out)]",
    invalid
      ? "border-error shadow-[var(--sz-ring-error)]"
      : "border-line focus-visible:border-primary-700 focus-visible:shadow-[var(--sz-ring-focus-soft)]",
  );

const label = "mb-[5px] block text-xs font-semibold text-body";

export function AdminLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pending, startTransition] = useTransition();

  const invalid = Boolean(failure);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setFailure(null);
    startTransition(async () => {
      const result = await adminSignIn(email, password);
      if (result.ok) {
        router.replace(result.redirectTo);
        router.refresh();
      } else {
        setFailure(result);
      }
    });
  }

  return (
    <form onSubmit={submit} noValidate className="mt-[18px] flex flex-col gap-[13px]">
      {failure?.kind === "locked" ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-[var(--sz-admin-radius-control)] border border-error/30 bg-error-soft px-3 py-[11px]"
        >
          <Icon name="lock" size={16} className="mt-px shrink-0 text-error" />
          <div>
            <p className="text-[12.5px] font-semibold text-heading">Account temporarily locked</p>
            <p className="mt-0.5 text-xs text-muted">{failure.message}</p>
          </div>
        </div>
      ) : failure ? (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-[var(--sz-admin-radius-control)] border border-error/30 bg-error-soft px-3 py-2.5 text-[12.5px] text-error"
        >
          <Icon name="alert" size={15} className="shrink-0" />
          {failure.message}
        </p>
      ) : null}

      <div>
        <label htmlFor="admin-email" className={label}>
          Email
        </label>
        <input
          id="admin-email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          autoFocus
          required
          aria-invalid={invalid || undefined}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@sazuna.com"
          className={field(invalid)}
        />
      </div>

      <div>
        <label htmlFor="admin-password" className={label}>
          Password
        </label>
        <input
          id="admin-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={invalid || undefined}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
          className={field(invalid)}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending || undefined}
        className="mt-0.5 inline-flex min-h-[46px] w-full cursor-pointer items-center justify-center gap-2.5 rounded-[var(--sz-admin-radius-control)] bg-primary-700 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:cursor-progress disabled:opacity-[var(--sz-disabled-opacity)]"
      >
        {pending && (
          <span
            aria-hidden="true"
            className="inline-block size-[15px] animate-spin rounded-pill border-2 border-white/40 border-t-white"
          />
        )}
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
