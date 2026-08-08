"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { ADD_TO_BAG_EVENT, type AddToBagDetail } from "@/lib/cart-events";
import { addToCart, onCartChanged, readCart, removeFromCart, setQuantity } from "@/lib/cart-storage";
import { priceBag } from "@/app/cart/_actions";
import { Icon } from "@/components/ui";
import { jewelleryUrl, NAV_CATEGORIES, NAV_FEATURED, type NavCategory } from "@/lib/navigation";
import { AccountMenu, type ShellCustomer } from "./account-menu";
import { AnnouncementBar } from "./announcement-bar";
import { MegaMenu } from "./mega-menu";
import { MiniCart, type MiniCartLine } from "./mini-cart";
import { MobileNav } from "./mobile-nav";
import { SearchOverlay } from "./search-overlay";

export interface SiteHeaderProps {
  /** Copy from the `announcement_bar` content block; absent renders no strip. */
  announcement?: {
    messages: string[];
    autoSlide: boolean;
    interval: number;
  } | null;
  /** Deep link from `site_identity`. Absent hides the search dead-end's escape hatch. */
  whatsappHref?: string | null;
  /** Signed-in customer. Absent renders the one-time-code panel. */
  customer?: ShellCustomer;
  /** True once the order qualifies for free insured shipping. */
  freeShipping?: boolean;
}

const navLinkClass =
  "whitespace-nowrap rounded-sm px-[11px] py-2 text-sm text-body no-underline transition-colors duration-[var(--sz-dur-fast)] hover:bg-primary-50 hover:text-primary-700 hover:no-underline";

const actionButtonClass =
  "inline-flex size-[var(--sz-action-btn)] cursor-pointer items-center justify-center rounded-[var(--sz-radius-control)] text-body no-underline transition-colors duration-[var(--sz-dur-fast)] hover:bg-surface hover:text-primary-700 hover:no-underline";

/**
 * Global storefront header — spec SazunaHeader.dc.html:60-186.
 *
 * MANDATORY SHARED COMPONENT. Pages must render this, never rebuild a header,
 * announcement bar, mega-menu, search overlay or mini-cart of their own.
 */
export function SiteHeader({
  announcement,
  whatsappHref,
  customer,
  freeShipping,
}: SiteHeaderProps) {
  // Mirrors localStorage, priced by the server. Seeded empty so the server and
  // the first client render agree; the sync below fills it in.
  const [lines, setLines] = useState<MiniCartLine[]>([]);
  const [scrolled, setScrolled] = useState(false);
  const [mega, setMega] = useState<NavCategory | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  /**
   * Publish the header's real height as `--sz-header-h`.
   *
   * Anything sticking below the header — the listing toolbar, the filter rail —
   * offsets by it. A hardcoded value is wrong the moment the header condenses on
   * scroll, which shows up as a gap under the sticky toolbar. A ResizeObserver
   * keeps it honest across the condense, the logo resize and any viewport change.
   */
  useEffect(() => {
    const node = headerRef.current;
    if (!node) return;
    const publish = () => {
      const height = Math.round(node.getBoundingClientRect().height);
      if (height > 20) {
        document.documentElement.style.setProperty("--sz-header-h", `${height}px`);
      }
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // One scroll listener for the whole shell. Passive: it never preventDefaults.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 44);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Dismiss the account panel on outside click or Escape. The panel holds a
  // half-finished sign-in, so it should not sit open behind other work.
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

  /**
   * Keep the bag badge and drawer in step with what the browser holds.
   *
   * The contents live in localStorage as ids and quantities; the server prices
   * them. That means the badge is correct after a reload and across tabs, and
   * no price ever comes from storage.
   */
  useEffect(() => {
    let active = true;
    let ticket = 0;

    const sync = () => {
      const entries = readCart();
      const mine = ++ticket;

      // An empty bag needs no server round trip, and most visitors have one.
      if (!entries.length) {
        if (active) setLines((current) => (current.length ? [] : current));
        return;
      }

      priceBag(entries)
        .then((priced) => {
          // A stale reply must not resurrect a line just removed.
          if (!active || mine !== ticket) return;
          setLines(
            priced.lines.map((line) => ({
              id: String(line.productId),
              name: line.name,
              price: line.price,
              priceMinor: line.priceMinor,
              quantity: line.quantity,
              href: line.href,
              imageUrl: line.imageUrl,
            })),
          );
        })
        .catch(() => {
          // Leave the last known contents rather than blanking the badge
          // because one request failed.
        });
    };

    // Deferred so the effect body itself never sets state.
    void Promise.resolve().then(() => {
      if (active) sync();
    });

    const unsubscribe = onCartChanged(sync);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // "Add to Bag" from a product page. Storage is the source of truth, so this
  // writes there and lets the sync above redraw; the drawer opens either way.
  useEffect(() => {
    const onAdd = (event: Event) => {
      const { detail } = event as CustomEvent<AddToBagDetail>;
      const productId = Number(detail?.id);
      if (!Number.isInteger(productId) || productId <= 0) return;
      addToCart(productId);
      setCartOpen(true);
      setMega(null);
      setAccountOpen(false);
    };
    window.addEventListener(ADD_TO_BAG_EVENT, onAdd);
    return () => window.removeEventListener(ADD_TO_BAG_EVENT, onAdd);
  }, []);

  const cartCount = lines.reduce((total, line) => total + line.quantity, 0);

  function openMega(category: NavCategory) {
    setMega(category);
    setAccountOpen(false);
  }

  return (
    <>
      {announcement && (
        <AnnouncementBar
          messages={announcement.messages}
          autoSlide={announcement.autoSlide}
          interval={announcement.interval}
        />
      )}

      <div className="sticky top-0 z-[60]" onMouseLeave={() => setMega(null)}>
        <header
          ref={headerRef}
          className="border-b border-line bg-[var(--sz-header-bg)] backdrop-blur-[var(--sz-header-blur)]"
        >
          <div
            className={cn(
              "mx-auto flex max-w-[var(--sz-container)] items-center gap-4",
              "px-[var(--sz-gutter-mobile)] nav-expanded:px-[var(--sz-gutter)]",
              "transition-[padding] duration-[var(--sz-dur-condense)] ease-[ease]",
              scrolled
                ? "py-[var(--sz-header-pad-y-condensed)]"
                : "py-[var(--sz-header-pad-y)]",
            )}
          >
            <button
              type="button"
              aria-label="Menu"
              aria-expanded={mobileNav}
              onClick={() => setMobileNav(true)}
              className="hidden size-10 shrink-0 cursor-pointer items-center justify-center text-body nav-collapsed:inline-flex"
            >
              <Icon name="menu" size={22} strokeWidth={1.6} />
            </button>

            <Link
              href="/"
              className="inline-flex shrink-0 items-center"
              aria-label="Sazuna Jewellers — home"
            >
              <Image
                src="/sazuna-logo.webp"
                alt="Sazuna Jewellers"
                width={1130}
                height={240}
                priority
                className={cn(
                  "block w-auto transition-[height] duration-[var(--sz-dur-condense)] ease-[ease]",
                  scrolled
                    ? "h-[var(--sz-logo-h-condensed)]"
                    : "h-[var(--sz-logo-h-mobile)] nav-expanded:h-[var(--sz-logo-h)]",
                )}
              />
            </Link>

            <nav
              aria-label="Categories"
              className="hidden min-w-0 flex-1 items-center justify-center gap-px overflow-x-auto nav-expanded:flex"
            >
              {NAV_CATEGORIES.map((category) => (
                <Link
                  key={category.slug}
                  href={jewelleryUrl(category.slug)}
                  onMouseEnter={() => openMega(category)}
                  onFocus={() => openMega(category)}
                  aria-expanded={mega?.slug === category.slug}
                  className={cn(
                    navLinkClass,
                    mega?.slug === category.slug && "bg-primary-50 text-primary-700",
                  )}
                >
                  {category.label}
                </Link>
              ))}

              <span aria-hidden="true" className="mx-1.5 h-4 w-px bg-line" />

              <Link
                href={jewelleryUrl(NAV_FEATURED.slug)}
                onMouseEnter={() => setMega(null)}
                onFocus={() => setMega(null)}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-[11px] py-2 text-sm font-semibold text-primary-700 no-underline transition-colors duration-[var(--sz-dur-fast)] hover:bg-primary-50 hover:no-underline"
              >
                <span aria-hidden="true" className="size-1.5 rotate-45 bg-accent" />
                {NAV_FEATURED.label}
              </Link>
            </nav>

            <div className="ml-auto flex shrink-0 items-center gap-1">
              <button
                type="button"
                aria-label="Search"
                onClick={() => {
                  setSearchOpen(true);
                  setMega(null);
                  setAccountOpen(false);
                }}
                className={actionButtonClass}
              >
                <Icon name="search" size={21} strokeWidth={1.6} />
              </button>

              <button
                type="button"
                aria-label="Account"
                aria-expanded={accountOpen}
                aria-haspopup="menu"
                onClick={() => {
                  setAccountOpen((open) => !open);
                  setMega(null);
                }}
                className={actionButtonClass}
              >
                <Icon name="account" size={21} strokeWidth={1.6} />
              </button>

              <button
                type="button"
                aria-label={`Bag, ${cartCount} item${cartCount === 1 ? "" : "s"}`}
                onClick={() => {
                  setCartOpen(true);
                  setMega(null);
                  setAccountOpen(false);
                }}
                className={cn(actionButtonClass, "relative")}
              >
                <Icon name="bag" size={21} strokeWidth={1.6} />
                {cartCount > 0 && (
                  <span className="absolute right-[5px] top-[5px] inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-pill border-[1.5px] border-canvas bg-primary-700 px-1 font-mono text-badge text-white">
                    {cartCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </header>

        {/*
          The panel hangs below the header, aligned to the container's right
          edge rather than the viewport's — the spec's fixed 40px offset only
          coincides with the account button at its own 1280px authoring width.
        */}
        {accountOpen && (
          <div className="absolute inset-x-0 top-full z-[70]">
            <div
              ref={accountRef}
              className="mx-auto flex max-w-[var(--sz-container)] justify-end px-[var(--sz-gutter-mobile)] nav-expanded:px-[var(--sz-gutter)]"
            >
              <AccountMenu customer={customer} />
            </div>
          </div>
        )}

        {mega && <MegaMenu category={mega} />}
      </div>

      <MobileNav
        open={mobileNav}
        onClose={() => setMobileNav(false)}
        onSignIn={() => setAccountOpen(true)}
        signedIn={Boolean(customer)}
      />

      {/* Mounted only while open: it reads recent searches from storage once,
          on the client, and should forget them between visits. */}
      {searchOpen && (
        <SearchOverlay onClose={() => setSearchOpen(false)} whatsappHref={whatsappHref} />
      )}



      <MiniCart
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        lines={lines}
        freeShipping={freeShipping}
        onRemove={(id) => removeFromCart(Number(id))}
        onQuantityChange={(id, quantity) => setQuantity(Number(id), quantity)}
      />
    </>
  );
}
