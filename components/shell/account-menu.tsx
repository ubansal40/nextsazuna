"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui";

/** Signed-in customer, as the header needs to render them. */
export interface ShellCustomer {
  name: string;
  loyaltyPoints?: number;
}

export interface AccountMenuProps {
  customer?: ShellCustomer;
  /**
   * The auth seams.
   *
   * `onRequestCode` sends the one-time code; `onSubmitCode` verifies it. Both
   * return a message on failure and nothing on success.
   *
   * **They must resolve, never reject.** The panel advances to the code step as
   * soon as `onRequestCode` settles, and a thrown error would leave the reader
   * on a screen with no explanation and an unhandled rejection in the console.
   * Failure is a value here.
   *
   * Absent, the panel still walks its own stages so the design stays
   * reviewable, but it never claims a session it has not been given — the
   * signed-in view renders from `customer`, nothing else.
   */
  onRequestCode?: (identity: string) => Promise<string | void> | string | void;
  onSubmitCode?: (identity: string, code: string) => Promise<string | void> | string | void;
  onLogOut?: () => void;
  /** Hidden while the loyalty scheme is switched off. */
  showLoyalty?: boolean;
  /**
   * The code, shown in the panel, on a developer's machine with no SMS gateway.
   * Server-gated — see `devCodeAllowed` in lib/auth/otp.ts. Without it there is
   * no way to sign in locally without buying SMS credit.
   */
  devCode?: string;
}

const OTP_LENGTH = 6;
const RESEND_SECONDS = 28;

const menuItemClass =
  "flex items-center gap-[11px] rounded-[var(--sz-radius-control)] px-3 py-[11px] text-sm text-body no-underline transition-colors duration-[var(--sz-dur-fast)] hover:bg-surface hover:no-underline";

const primaryButtonClass =
  "w-full cursor-pointer rounded-[var(--sz-radius-control)] bg-primary-700 p-3 text-sm font-semibold text-white transition-colors duration-[var(--sz-dur-fast)] hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-[var(--sz-disabled-opacity)]";

/** Masks a phone or email enough to confirm it without reprinting it in full. */
function maskIdentity(identity: string): string {
  if (identity.includes("@")) {
    const [user, domain] = identity.split("@");
    return `${user.slice(0, 2)}•••@${domain}`;
  }
  return identity.length > 6
    ? `${identity.slice(0, 4)}•••••${identity.slice(-3)}`
    : identity;
}

/**
 * Account dropdown — spec §Account dropdown (SazunaHeader.dc.html:100-142).
 *
 * Two panels behind one button: the signed-out one-time-code flow, and the
 * signed-in menu. Positioning belongs to SiteHeader; this only draws the panel.
 */
export function AccountMenu({
  customer,
  onRequestCode,
  onSubmitCode,
  onLogOut,
  showLoyalty = false,
  devCode,
}: AccountMenuProps) {
  const [stage, setStage] = useState<"identity" | "code">("identity");
  const [identity, setIdentity] = useState("");
  const [digits, setDigits] = useState<string[]>(() => Array(OTP_LENGTH).fill(""));
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  // Resend countdown. Restarts whenever a fresh code is requested.
  useEffect(() => {
    if (stage !== "code" || secondsLeft === 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [stage, secondsLeft]);

  const code = digits.join("");

  async function requestCode() {
    if (!identity.trim() || pending) return;
    setPending(true);
    setError("");
    try {
      const message = await onRequestCode?.(identity.trim());
      // Stay put on failure. Advancing anyway would ask for a code that was
      // never sent, and the reader would have no idea why nothing arrives.
      if (typeof message === "string" && message) {
        setError(message);
        return;
      }
      setStage("code");
      setSecondsLeft(RESEND_SECONDS);
      setDigits(Array(OTP_LENGTH).fill(""));
      // Focus the first box so the code can be typed without reaching for the
      // mouse — the whole point of a one-time code.
      requestAnimationFrame(() => boxes.current[0]?.focus());
    } finally {
      setPending(false);
    }
  }

  async function submitCode() {
    if (code.length < OTP_LENGTH || pending) return;
    setPending(true);
    setError("");
    try {
      const message = await onSubmitCode?.(identity.trim(), code);
      if (typeof message === "string" && message) {
        setError(message);
        // Clear the boxes and go back to the first, so a retry is one action
        // rather than six backspaces.
        setDigits(Array(OTP_LENGTH).fill(""));
        requestAnimationFrame(() => boxes.current[0]?.focus());
      }
      // Success needs nothing here: the session is set server-side and the
      // signed-in view renders from `customer` once the shell re-renders.
    } finally {
      setPending(false);
    }
  }

  function setDigit(index: number, value: string) {
    const typed = value.replace(/\D/g, "");
    if (!typed) {
      setDigits((current) => current.map((d, i) => (i === index ? "" : d)));
      return;
    }
    // Accept a pasted or autofilled code by spilling it across the boxes.
    setDigits((current) => {
      const next = [...current];
      for (let i = 0; i < typed.length && index + i < OTP_LENGTH; i += 1) {
        next[index + i] = typed[i];
      }
      return next;
    });
    boxes.current[Math.min(index + typed.length, OTP_LENGTH - 1)]?.focus();
  }

  function onDigitKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      boxes.current[index - 1]?.focus();
    }
    if (event.key === "ArrowLeft" && index > 0) boxes.current[index - 1]?.focus();
    if (event.key === "ArrowRight" && index < OTP_LENGTH - 1) boxes.current[index + 1]?.focus();
  }

  if (customer) {
    return (
      <div className={panelClass}>
        <div className="flex items-center gap-3 border-b border-line-soft px-[22px] py-[18px]">
          <span className="inline-flex size-10 items-center justify-center rounded-[var(--sz-radius-pill)] bg-primary-800 font-[family-name:var(--sz-font-display)] text-avatar text-accent">
            {customer.name.trim().charAt(0).toUpperCase()}
          </span>
          <div>
            <p className="m-0 text-control font-semibold text-heading">
              Namaste, {customer.name}
            </p>
            {customer.loyaltyPoints !== undefined && (
              <p className="m-0 font-mono text-2xs text-accent-strong">
                ◇ {customer.loyaltyPoints.toLocaleString("en-IN")} loyalty points
              </p>
            )}
          </div>
        </div>

        <div className="p-2">
          <Link href="/account/orders" role="menuitem" className={menuItemClass}>
            <Icon name="bag" size={18} strokeWidth={1.6} className="text-primary-700" />
            Orders
          </Link>
          {/* Hidden until the loyalty scheme is switched on — a menu entry to a
              page that says nothing is worse than no entry. */}
          {showLoyalty && (
            <Link href="/account/loyalty" role="menuitem" className={menuItemClass}>
              <Icon name="star" size={18} strokeWidth={1.6} className="text-primary-700" />
              Loyalty
            </Link>
          )}
          <Link href="/account" role="menuitem" className={menuItemClass}>
            <Icon name="account" size={18} strokeWidth={1.6} className="text-primary-700" />
            Profile
          </Link>

          <span aria-hidden="true" className="mx-1 my-1.5 block h-px bg-line-soft" />

          <button
            type="button"
            role="menuitem"
            onClick={onLogOut}
            className="flex w-full cursor-pointer items-center gap-[11px] rounded-[var(--sz-radius-control)] px-3 py-[11px] text-left text-sm text-error transition-colors duration-[var(--sz-dur-fast)] hover:bg-error-soft"
          >
            Log out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={panelClass}>
      <div className="px-[22px] py-5">
        {stage === "identity" ? (
          <>
            <p className="m-0 mb-1 font-[family-name:var(--sz-font-display)] text-dropdown-title text-heading">
              Sign in
            </p>
            <p className="m-0 mb-4 text-control-sm text-muted">
              We&rsquo;ll text a one-time code — no password.
            </p>

            <label
              htmlFor="shell-identity"
              className="mb-1.5 block text-xs font-semibold text-body"
            >
              Phone or email
            </label>
            <input
              id="shell-identity"
              name="identity"
              type="text"
              inputMode="tel"
              autoComplete="tel"
              value={identity}
              onChange={(event) => setIdentity(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") requestCode();
              }}
              placeholder="+977 98XXXXXXXX"
              // The soft field ring, as every other text control in the system
              // uses — not the heavier global button ring.
              className="w-full rounded-[var(--sz-radius-control)] border border-line bg-raised px-[13px] py-[11px] text-control text-body outline-none transition-[border-color,box-shadow] duration-[var(--sz-dur)] ease-[var(--sz-ease-out)] focus-visible:border-primary-700 focus-visible:shadow-[var(--sz-ring-focus-soft)]"
            />

            <SignInError message={error} />

            <button
              type="button"
              onClick={requestCode}
              disabled={!identity.trim() || pending}
              className={cn(primaryButtonClass, "mt-3.5")}
            >
              {pending ? "Sending…" : "Send code"}
            </button>

            <p className="m-0 mt-3 text-center text-2xs text-muted-soft">
              By continuing you agree to our{" "}
              <Link href="/terms" className="text-muted-soft underline">
                Terms
              </Link>{" "}
              &amp;{" "}
              <Link href="/privacy" className="text-muted-soft underline">
                Privacy
              </Link>
              .
            </p>
          </>
        ) : (
          <>
            <p className="m-0 mb-1 font-[family-name:var(--sz-font-display)] text-dropdown-title text-heading">
              Enter code
            </p>
            <p className="m-0 mb-4 text-control-sm text-muted">
              Sent to {maskIdentity(identity)}.{" "}
              <button
                type="button"
                onClick={() => setStage("identity")}
                className="cursor-pointer p-0 text-control-sm font-semibold text-primary-700 underline"
              >
                Change
              </button>
            </p>

            <div className="flex justify-between gap-[7px]">
              {digits.map((digit, index) => (
                <input
                  // The boxes are positional and never reorder, so the index is
                  // the only stable identity they have.
                  key={index}
                  ref={(node) => {
                    boxes.current[index] = node;
                  }}
                  value={digit}
                  onChange={(event) => setDigit(index, event.target.value)}
                  onKeyDown={(event) => onDigitKeyDown(index, event)}
                  inputMode="numeric"
                  autoComplete={index === 0 ? "one-time-code" : "off"}
                  aria-label={`Digit ${index + 1} of ${OTP_LENGTH}`}
                  className={cn(
                    "h-[var(--sz-otp-h)] min-w-0 flex-1 rounded-[var(--sz-radius-control)] border bg-raised text-center font-mono text-otp outline-none transition-[border-color,box-shadow] duration-[var(--sz-dur)] ease-[var(--sz-ease-out)] focus-visible:border-primary-700 focus-visible:shadow-[var(--sz-ring-focus-soft)]",
                    digit ? "border-primary-700 text-heading" : "border-line text-muted",
                  )}
                />
              ))}
            </div>

            {devCode && (
              <p className="m-0 mt-3 rounded-[var(--sz-radius-control)] bg-warning-soft px-3 py-2 text-2xs text-body">
                No SMS gateway configured — your code is{" "}
                <strong className="font-mono">{devCode}</strong>
              </p>
            )}

            <SignInError message={error} />

            <button
              type="button"
              onClick={submitCode}
              disabled={code.length < OTP_LENGTH || pending}
              className={cn(primaryButtonClass, "mt-3.5")}
            >
              {pending ? "Verifying…" : "Verify & continue"}
            </button>

            <p className="m-0 mt-3 text-center text-xs text-muted">
              Didn&rsquo;t get it?{" "}
              <button
                type="button"
                onClick={requestCode}
                disabled={secondsLeft > 0}
                className="cursor-pointer p-0 text-xs font-semibold text-primary-700 underline disabled:cursor-default disabled:text-muted disabled:no-underline"
              >
                {secondsLeft > 0
                  ? `Resend in 0:${String(secondsLeft).padStart(2, "0")}`
                  : "Resend code"}
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// Capped to the viewport so the 320px panel cannot push the page sideways on a
// narrow phone, where it hangs off the same right edge as on desktop.
const panelClass =
  "w-[var(--sz-dropdown-w)] max-w-[calc(100vw-2*var(--sz-gutter-mobile))] overflow-hidden rounded-[var(--sz-radius-lg)] border border-line bg-canvas shadow-dropdown animate-fade-down";

/**
 * The panel's only error surface.
 *
 * `role="alert"` so a screen reader announces a wrong code without the reader
 * having to go looking for it — the six boxes clear on failure, and silence
 * plus an empty form reads as the app having lost the input.
 */
function SignInError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="m-0 mt-3 flex items-start gap-1.5 text-2xs leading-relaxed text-error"
    >
      <Icon name="alert" size={13} strokeWidth={2} className="mt-px shrink-0" />
      {message}
    </p>
  );
}
