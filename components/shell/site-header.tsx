"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { NAV_CATEGORIES, NAV_FEATURED } from "@/lib/navigation";
import { buttonVariants, Drawer, Icon } from "@/components/ui";
import { AnnouncementBar } from "./announcement-bar";
import { MegaMenu } from "./mega-menu";
import { MiniCart } from "./mini-cart";

export interface SiteHeaderProps {
  /** Item count on the bag badge. */
  cartCount?: number;
  /** Signed-in customer's first name; absent renders the signed-out menu. */
  customerName?: string;
}

/**
 * Global storefront header — spec §Global shell.
 *
 * MANDATORY SHARED COMPONENT. Pages must render this, never rebuild a header,
 * announcement bar, mega-menu or mini-cart of their own. Change it once, here.
 */
export function SiteHeader({ cartCount = 0, customerName }: SiteHeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [openMega, setOpenMega] = useState<string | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  // One scroll listener for the whole shell: collapses the announcement bar and
  // shrinks the logo. Passive because it never calls preventDefault.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Dismiss the account dropdown on outside click or Escape.
  useEffect(() => {
    if (!accountOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [accountOpen]);

  const activeCategory = NAV_CATEGORIES.find((category) => category.label === openMega);

  return (
    <>
      <AnnouncementBar collapsed={scrolled} />

      <header
        className="sticky top-0 z-[60] border-b border-line bg-canvas"
        onMouseLeave={() => setOpenMega(null)}
      >
        <div className="mx-auto flex max-w-[var(--sz-container)] items-center gap-3 px-6 md:px-10">
          <button
            type="button"
            aria-label="Menu"
            aria-expanded={mobileNav}
            onClick={() => setMobileNav(true)}
            className="inline-flex size-10 shrink-0 cursor-pointer items-center justify-center text-body lg:hidden"
          >
            <Icon name="menu" size={22} />
          </button>

          <Link
            href="/"
            className="inline-flex shrink-0 items-center py-3"
            aria-label="Sazuna Jewellers — home"
          >
            <Image
              src="/sazuna-logo.webp"
              alt="Sazuna Jewellers"
              width={1130}
              height={240}
              priority
              className={cn(
                "w-auto transition-[height] duration-[250ms] ease-[var(--sz-ease-out)]",
                scrolled ? "h-6" : "h-8",
              )}
            />
          </Link>

          <nav
            aria-label="Categories"
            className="hidden min-w-0 flex-1 items-center justify-center gap-px overflow-x-auto lg:flex"
          >
            {NAV_CATEGORIES.map((category) => (
              <Link
                key={category.label}
                href={category.href}
                onMouseEnter={() => setOpenMega(category.columns ? category.label : null)}
                onFocus={() => setOpenMega(category.columns ? category.label : null)}
                aria-expanded={category.columns ? openMega === category.label : undefined}
                className={cn(
                  "whitespace-nowrap rounded-[var(--sz-radius-sm)] px-[11px] py-2 text-sm no-underline",
                  "transition-colors duration-[var(--sz-dur-fast)]",
                  openMega === category.label
                    ? "bg-primary-50 text-primary-700"
                    : "text-body hover:bg-primary-50 hover:text-primary-700",
                  "hover:no-underline",
                )}
              >
                {category.label}
              </Link>
            ))}

            <span aria-hidden="true" className="mx-1.5 h-4 w-px bg-line" />

            <Link
              href={NAV_FEATURED.href}
              onMouseEnter={() => setOpenMega(null)}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[var(--sz-radius-sm)] px-[11px] py-2 text-sm font-semibold text-primary-700 no-underline hover:bg-primary-50 hover:no-underline"
            >
              <span aria-hidden="true" className="size-1.5 rotate-45 bg-accent" />
              {NAV_FEATURED.label}
            </Link>
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            <Link
              href="/search"
              aria-label="Search"
              className="inline-flex size-[42px] items-center justify-center rounded-[var(--sz-radius-control)] text-body no-underline transition-colors duration-[var(--sz-dur-fast)] hover:bg-primary-50 hover:text-primary-700"
            >
              <Icon name="search" size={20} />
            </Link>

            <div ref={accountRef} className="relative">
              <button
                type="button"
                aria-label="Account"
                aria-expanded={accountOpen}
                aria-haspopup="menu"
                onClick={() => setAccountOpen((open) => !open)}
                className="inline-flex size-[42px] cursor-pointer items-center justify-center rounded-[var(--sz-radius-control)] text-body transition-colors duration-[var(--sz-dur-fast)] hover:bg-primary-50 hover:text-primary-700"
              >
                <Icon name="account" size={20} />
              </button>

              {accountOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-[70] mt-2 w-[320px] rounded-[var(--sz-radius-lg)] border border-line bg-canvas p-2 shadow-lg animate-scale-in"
                >
                  {customerName ? (
                    <>
                      <p className="px-3 py-2 text-sm text-muted">
                        Namaste, <span className="font-semibold text-heading">{customerName}</span>
                      </p>
                      <span className="my-1.5 mx-1 block h-px bg-line-soft" />
                      {[
                        { label: "Profile", href: "/account" },
                        { label: "Orders", href: "/account/orders" },
                        { label: "Loyalty", href: "/account/loyalty" },
                      ].map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          role="menuitem"
                          className="block rounded-[var(--sz-radius-sm)] px-3 py-2 text-sm text-body no-underline hover:bg-primary-50 hover:text-primary-700 hover:no-underline"
                        >
                          {item.label}
                        </Link>
                      ))}
                      <span className="my-1.5 mx-1 block h-px bg-line-soft" />
                      <Link
                        href="/account/logout"
                        role="menuitem"
                        className="block rounded-[var(--sz-radius-sm)] px-3 py-2 text-sm text-muted no-underline hover:bg-primary-50 hover:no-underline"
                      >
                        Log out
                      </Link>
                    </>
                  ) : (
                    <div className="p-2">
                      <p className="text-sm font-semibold text-heading">Sign in</p>
                      <p className="mt-1 text-xs text-muted">
                        Track orders and collect loyalty points.
                      </p>
                      <Link
                        href="/account/login"
                        role="menuitem"
                        className={cn(
                          buttonVariants({ size: "sm" }),
                          "mt-3 w-full no-underline hover:no-underline",
                        )}
                      >
                        Sign in
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              aria-label={`Bag, ${cartCount} item${cartCount === 1 ? "" : "s"}`}
              onClick={() => setCartOpen(true)}
              className="relative inline-flex size-[42px] cursor-pointer items-center justify-center rounded-[var(--sz-radius-control)] text-body transition-colors duration-[var(--sz-dur-fast)] hover:bg-primary-50 hover:text-primary-700"
            >
              <Icon name="bag" size={20} />
              {cartCount > 0 && (
                <span className="absolute right-1 top-1 inline-flex min-w-[17px] items-center justify-center rounded-[var(--sz-radius-pill)] bg-primary-700 px-1 font-mono text-[length:var(--sz-text-micro)] leading-[17px] text-white">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {activeCategory && <MegaMenu category={activeCategory} />}
      </header>

      <Drawer open={mobileNav} onClose={() => setMobileNav(false)} title="Categories" side="left">
        <nav aria-label="Categories">
          <ul className="flex flex-col gap-1 list-none p-0 m-0">
            {[...NAV_CATEGORIES, NAV_FEATURED].map((category) => (
              <li key={category.label}>
                <Link
                  href={category.href}
                  onClick={() => setMobileNav(false)}
                  className="flex items-center justify-between rounded-[var(--sz-radius-sm)] px-3 py-3 text-sm text-body no-underline hover:bg-primary-50 hover:text-primary-700 hover:no-underline"
                >
                  {category.label}
                  <Icon name="chevron-right" size={16} className="text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Drawer>

      <MiniCart open={cartOpen} onClose={() => setCartOpen(false)} />
    </>
  );
}
