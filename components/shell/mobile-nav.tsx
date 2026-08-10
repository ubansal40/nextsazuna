"use client";

import Image from "next/image";
import Link from "next/link";
import { Icon, useDialog } from "@/components/ui";
import { jewelleryUrl, NAV_CATEGORIES, NAV_FEATURED } from "@/lib/navigation";

export interface MobileNavProps {
  open: boolean;
  onClose: () => void;
  /** Opens the account panel; the drawer has no sign-in form of its own. */
  onSignIn: () => void;
  signedIn?: boolean;
}

const rowClass =
  "flex items-center justify-between border-b border-line-soft px-1 py-3.5 font-[family-name:var(--sz-font-display)] text-md text-heading no-underline hover:no-underline";

/**
 * Mobile navigation drawer — spec §Mobile nav (SazunaHeader.dc.html:89-96).
 *
 * Replaces the desktop category bar below 900px. A native <dialog> so the
 * platform handles focus trapping, Escape and the inert background.
 */
export function MobileNav({ open, onClose, onSignIn, signedIn = false }: MobileNavProps) {
  const { ref, onBackdropClick } = useDialog(open, onClose);

  return (
    <dialog
      ref={ref}
      onClick={onBackdropClick}
      aria-label="Categories"
      className="m-0 mr-auto h-dvh max-h-dvh w-[86%] max-w-[var(--sz-nav-drawer-w)] bg-canvas p-0 text-body backdrop:bg-[var(--sz-scrim-soft)] backdrop:animate-fade open:animate-nav-in"
    >
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center justify-between border-b border-line px-[18px] py-[15px]">
          <Link href="/" onClick={onClose} aria-label="Sazuna Jewellers — home">
            <Image
              src="/sazuna-logo.webp"
              alt="Sazuna Jewellers"
              width={1130}
              height={240}
              className="block h-[var(--sz-logo-h-drawer)] w-auto"
            />
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            // 22px of icon inside a --sz-control-h tap target. This drawer only
            // exists below 900px, where every visitor is using a thumb, and
            // this is its only way out other than the backdrop — so the target
            // is grown with a pseudo-element, which costs the row no layout.
            className="relative inline-flex cursor-pointer p-0 text-body after:absolute after:left-1/2 after:top-1/2 after:size-[var(--sz-control-h)] after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']"
          >
            <Icon name="close" size={22} />
          </button>
        </div>

        <nav aria-label="Categories" className="flex-1 overflow-y-auto overscroll-contain px-[18px] py-1.5">
          {NAV_CATEGORIES.map((category) => (
            <Link
              key={category.slug}
              href={jewelleryUrl(category.slug)}
              onClick={onClose}
              className={rowClass}
            >
              {category.label}
              <Icon name="chevron-right" size={18} className="text-muted-soft" />
            </Link>
          ))}

          <Link
            href={jewelleryUrl(NAV_FEATURED.slug)}
            onClick={onClose}
            className="flex items-center gap-2 px-1 py-3.5 font-[family-name:var(--sz-font-display)] text-md text-primary-700 no-underline hover:no-underline"
          >
            <span aria-hidden="true" className="size-[7px] rotate-45 bg-accent" />
            {NAV_FEATURED.label}
          </Link>
        </nav>

        <div className="shrink-0 border-t border-line bg-surface px-[18px] py-3">
          {signedIn ? (
            <Link
              href="/account"
              onClick={onClose}
              className="block w-full cursor-pointer rounded-[var(--sz-radius-control)] bg-primary-700 p-3 text-center text-control-sm font-semibold text-white no-underline transition-colors duration-[var(--sz-dur-fast)] hover:bg-primary-800 hover:no-underline"
            >
              My account
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => {
                onClose();
                onSignIn();
              }}
              className="w-full cursor-pointer rounded-[var(--sz-radius-control)] bg-primary-700 p-3 text-control-sm font-semibold text-white transition-colors duration-[var(--sz-dur-fast)] hover:bg-primary-800"
            >
              Sign in
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}
