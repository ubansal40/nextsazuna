"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, ToastProvider, type IconName } from "@/components/ui";
import { cn } from "@/lib/cn";
import { sectionTitle, type VisibleNav } from "@/lib/admin/nav";
import { adminSignOut } from "@/app/(admin)/admin/_actions";

/**
 * The admin shell — Sazuna Admin.dc.html §Shell.
 *
 * A client component because the sidebar is stateful: it slides off-canvas on
 * mobile and its accordions open and close. Everything it *shows* is computed on
 * the server — the visible nav is already gated to what this admin may reach —
 * so no authorization decision is made here; this only draws.
 *
 * (The spec's desktop collapse-to-66px rail is a follow-up; the sidebar is full
 * width on desktop and an off-canvas drawer below `lg` for now.)
 */

interface AdminShellProps {
  admin: { name: string | null; email: string; isOwner: boolean };
  nav: VisibleNav;
  environment: "production" | "development";
  children: React.ReactNode;
}

function isActive(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({ admin, nav, environment, children }: AdminShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  // The account menu closes when the pointer goes down outside it — the effect
  // only subscribes to a DOM event and sets state from its callback, which is
  // exactly what an effect is for (the mobile drawer closes on nav-click and via
  // its scrim instead, so neither resets state synchronously on render).
  useEffect(() => {
    if (!accountOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (accountRef.current && !accountRef.current.contains(event.target as Node)) {
        setAccountOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [accountOpen]);

  const closeDrawer = () => setMobileOpen(false);
  const title = sectionTitle(pathname);
  const roleLabel = admin.isOwner ? "Owner" : "Staff";
  const avatarInitial = (admin.name?.trim() || admin.email).charAt(0).toUpperCase();

  return (
    <ToastProvider>
    <div className="min-h-dvh bg-admin-canvas lg:grid lg:grid-cols-[var(--sz-admin-side-w)_minmax(0,1fr)]">
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-[var(--sz-overlay)] lg:hidden"
        />
      )}

      {/* SIDEBAR */}
      <aside
        aria-label="Admin navigation"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[var(--sz-admin-side-w)] flex-col border-r border-line-soft bg-canvas transition-transform duration-[var(--sz-dur)] ease-[var(--sz-ease-out)]",
          "lg:static lg:z-auto lg:transition-none",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="sticky top-0 z-[2] flex items-center gap-2.5 border-b border-line-soft bg-canvas px-3 py-3.5">
          <Image src="/sazuna-logo.webp" alt="Sazuna" width={1130} height={240} loading="eager" className="h-5 w-auto shrink-0" />
          <span className="font-mono text-[8.5px] uppercase tracking-[0.2em] text-accent-strong">Admin</span>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="ml-auto inline-flex size-8 items-center justify-center rounded-[7px] text-muted hover:bg-surface lg:hidden"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 py-2.5 pb-4">
          <NavLink item={nav.dashboard} pathname={pathname} onNavigate={closeDrawer} />

          {nav.groups.map((group) => (
            <div key={group.label} className="mt-2.5">
              <p className="px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.15em] text-accent-strong">
                {group.label}
              </p>
              {group.accordions.map((acc) => (
                <Accordion
                  key={acc.label}
                  label={acc.label}
                  icon={acc.icon}
                  // Open by default — the spec's Catalog accordions start expanded
                  // so every destination is visible without a hunt.
                  defaultOpen
                >
                  {acc.items.map((item) => (
                    <NavLink key={item.href} item={item} pathname={pathname} onNavigate={closeDrawer} sub />
                  ))}
                </Accordion>
              ))}
              {group.items.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} onNavigate={closeDrawer} />
              ))}
            </div>
          ))}
        </nav>

        <div className="border-t border-line-soft p-2.5">
          <NavLink item={nav.storefront} pathname={pathname} onNavigate={closeDrawer} />
        </div>
      </aside>

      {/* CONTENT COLUMN */}
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-raised/95 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-2.5">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              className="inline-flex size-10 items-center justify-center rounded-[var(--sz-admin-radius-control)] border border-line bg-raised text-body lg:hidden"
            >
              <Icon name="menu" size={18} />
            </button>

            <h1 className="min-w-0 flex-1 truncate font-display text-[17px] font-medium tracking-[-0.01em] text-heading">
              {title}
            </h1>

            <div className="ml-auto flex items-center gap-2.5">
              <span className="hidden items-center gap-1.5 rounded-[6px] border border-accent-soft bg-warning-soft px-2 py-1 font-mono text-[9.5px] font-semibold tracking-[0.06em] text-[var(--sz-admin-gold-ink)] sm:inline-flex">
                <span aria-hidden="true">●</span>
                {environment === "production" ? "PRODUCTION" : "DEVELOPMENT"}
              </span>

              <div className="relative" ref={accountRef}>
                <button
                  type="button"
                  onClick={() => setAccountOpen((o) => !o)}
                  aria-label="Account menu"
                  aria-expanded={accountOpen}
                  className="flex items-center gap-2 rounded-pill p-[3px] hover:bg-admin-canvas"
                >
                  <span className="inline-flex size-[33px] shrink-0 items-center justify-center rounded-pill bg-primary-800 font-display text-sm text-accent">
                    {avatarInitial}
                  </span>
                  <span className="hidden flex-col items-start leading-tight sm:flex">
                    <span className="text-[12.5px] font-semibold text-heading">
                      {admin.name?.trim() || admin.email}
                    </span>
                    <span className="font-mono text-[9.5px] text-[var(--sz-admin-gold-ink)]">{roleLabel}</span>
                  </span>
                </button>

                {accountOpen && (
                  <div className="absolute right-0 top-[calc(100%+8px)] z-[60] w-[212px] rounded-[12px] border border-line bg-raised p-1.5 shadow-[var(--sz-shadow-dropdown)]">
                    <div className="border-b border-line-soft px-3 py-2.5">
                      <p className="text-[12.5px] font-semibold text-heading">{admin.name?.trim() || "Administrator"}</p>
                      <p className="truncate font-mono text-[10.5px] text-muted">
                        {roleLabel} · {admin.email}
                      </p>
                    </div>
                    <form action={adminSignOut}>
                      <button
                        type="submit"
                        className="flex min-h-10 w-full items-center rounded-lg px-3 text-[13px] text-error hover:bg-error-soft"
                      >
                        Sign out
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 px-4 py-[18px] pb-14 sm:px-[18px]">{children}</div>
      </div>
    </div>
    </ToastProvider>
  );
}

/* --- sidebar building blocks ---------------------------------------------- */

function NavLink({
  item,
  pathname,
  onNavigate,
  sub = false,
}: {
  item: { label: string; href: string; icon: IconName };
  pathname: string;
  onNavigate?: () => void;
  sub?: boolean;
}) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-10 items-center gap-2.5 rounded-[var(--sz-admin-radius-control)] px-[11px] text-[13.5px] no-underline transition-colors",
        sub && "ml-[9px] pl-2.5",
        active
          ? "bg-primary-50 font-semibold text-primary-700"
          : "text-body hover:bg-surface hover:text-heading hover:no-underline",
      )}
    >
      {sub && (
        <span
          className={cn("size-1.5 shrink-0 rounded-pill", active ? "bg-primary-700" : "bg-line")}
          aria-hidden="true"
        />
      )}
      <Icon name={item.icon} size={17} strokeWidth={1.6} className="shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function Accordion({
  label,
  icon,
  defaultOpen,
  children,
}: {
  label: string;
  icon: IconName;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-10 w-full items-center gap-2.5 rounded-[var(--sz-admin-radius-control)] px-[11px] text-[13.5px] text-body hover:bg-surface"
      >
        <Icon name={icon} size={17} strokeWidth={1.6} className="shrink-0" />
        <span className="truncate">{label}</span>
        <Icon name="chevron-down" size={12} className={cn("ml-auto shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="mt-0.5">{children}</div>}
    </div>
  );
}
