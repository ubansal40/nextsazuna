"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { ADD_TO_BAG_EVENT, type AddToBagDetail } from "@/lib/cart-events";
import {
  addToCart,
  type CartEntry,
  onCartChanged,
  readCart,
  removeFromCart,
  setQuantity,
} from "@/lib/cart-storage";
import { priceBag } from "@/app/(storefront)/cart/_actions";
import { Icon } from "@/components/ui";
import { jewelleryUrl, NAV_CATEGORIES, NAV_FEATURED, type NavCategory } from "@/lib/navigation";
import { requestSignInCode, signOut, submitSignInCode } from "@/app/(storefront)/account/_actions";
import { AccountMenu, type ShellCustomer } from "./account-menu";
import { AnnouncementBar } from "./announcement-bar";
import { MEGA_PANEL_ID, MegaMenu } from "./mega-menu";
import { MiniCart, type MiniCartLine, type MiniCartStatus } from "./mini-cart";
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
  /**
   * The bag, in two halves.
   *
   * `lines` is what the server priced; `null` means "not priced yet" and is
   * deliberately distinct from `[]`, which means the bag really is empty. They
   * used to be the same value, so the badge and the drawer both claimed an
   * empty bag for as long as the pricing request was in the air — and forever
   * if it failed on a first load, because the catch below has nothing to keep.
   *
   * `stored` is what localStorage holds: ids and quantities only, never a
   * price (lib/cart-storage.ts). Enough to badge the bag correctly the moment
   * the page is interactive, without trusting the client for money.
   */
  const [lines, setLines] = useState<MiniCartLine[] | null>(null);
  const [stored, setStored] = useState<CartEntry[]>([]);
  const [pricingFailed, setPricingFailed] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [mega, setMega] = useState<NavCategory | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [devCode, setDevCode] = useState("");
  const headerRef = useRef<HTMLElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  // The category link that opened the mega-menu, so Escape can hand focus back.
  const megaTrigger = useRef<HTMLAnchorElement | null>(null);
  // Re-runs the pricing sync on demand. Held in a ref because the sync closes
  // over the effect's own cancellation state; nothing polls or retries by
  // itself, this only fires when a customer asks it to.
  const retryPricing = useRef(() => {});
  const router = useRouter();
  const checkout = usePathname()?.startsWith("/checkout") ?? false;

  /**
   * Sign-in wiring.
   *
   * The actions live under `app/account/` because that is where "use server"
   * modules belong; importing them into a client component is the documented
   * way round. What stays here is the copy, because it is UI text — the actions
   * return a reason, never a sentence.
   *
   * Every handler returns a string on failure and nothing on success. Throwing
   * would strand the reader: AccountMenu advances as soon as the promise
   * settles and has nowhere to put an exception.
   */
  async function onRequestCode(identity: string): Promise<string | void> {
    const result = await requestSignInCode(identity);
    if (result.ok) {
      // Only ever present on a dev machine with no SMS gateway.
      setDevCode(result.devCode ?? "");
      return;
    }
    return {
      invalid: "Enter a 10-digit Nepali mobile number.",
      throttled: "You've asked for a few codes already — please wait a minute.",
      undeliverable: "We couldn't send a code to that number. Try WhatsApp instead.",
      failed: "Something went wrong. Please try again.",
    }[result.error];
  }

  async function onSubmitCode(identity: string, code: string): Promise<string | void> {
    const result = await submitSignInCode(identity, code);
    if (result.ok) {
      // The session is a cookie the server just set; the header renders from
      // it, so the tree has to be re-fetched before the panel can flip.
      setAccountOpen(false);
      router.refresh();
      return;
    }
    return {
      invalid: "Enter the six-digit code we sent you.",
      "wrong-code": "That code didn't match. Check it and try again.",
      "locked-out": "Too many attempts. Ask for a new code.",
      failed: "Something went wrong. Please try again.",
    }[result.error];
  }

  async function onLogOut() {
    await signOut();
    setAccountOpen(false);
    router.refresh();
  }

  /**
   * Publish the header's real height as `--sz-header-h`.
   *
   * Anything sticking below the header — the listing toolbar, the filter rail —
   * offsets by it. A hardcoded value is wrong the moment the header condenses on
   * scroll, which shows up as a gap under the sticky toolbar. A ResizeObserver
   * keeps it honest across the condense, the logo resize and any viewport change.
   *
   * Keyed on `checkout` because that branch mounts a *different* <header>
   * element. With an empty dep list the observer stayed bound to the detached
   * storefront header — a leak — and the token froze at its last pre-checkout
   * value for the rest of the session, throwing off every sticky offset on the
   * site. Any further early return needs the same treatment.
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
    // `checkout` is not read here — it is the signal that React has swapped one
    // <header> element for another, which is exactly when the observer has to
    // be rebound. The ref alone cannot say that.
  }, [checkout]);

  // One scroll listener for the whole shell. Passive: it never preventDefaults.
  useEffect(() => {
    // Read once, outside the handler: getComputedStyle inside it would force a
    // style recalculation on every frame the page moves. No literal fallback —
    // if the token ever went missing the comparison is simply never true and
    // the header stays tall, which beats duplicating the value here.
    const condenseAt = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--sz-header-condense-at"),
    );
    const onScroll = () => setScrolled(window.scrollY > condenseAt);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /**
   * Escape closes the mega-menu.
   *
   * The panel is hover-opened but keyboard-reachable (it sits in the tab order
   * directly after the category links), so a reader can be *inside* it when it
   * closes. Focus goes back to the link that opened it in that case, rather
   * than falling to <body> at the top of the document. When the panel does not
   * hold focus — the ordinary hover case — focus is left exactly where it is.
   */
  useEffect(() => {
    if (!mega) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const holdsFocus = document.activeElement?.closest(`#${MEGA_PANEL_ID}`);
      setMega(null);
      if (holdsFocus) megaTrigger.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mega]);

  // Dismiss the account panel on outside click or Escape. The panel holds a
  // half-finished sign-in, so it should not sit open behind other work.
  useEffect(() => {
    if (!accountOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      // The trigger counts as inside. Without this the button cannot close its
      // own panel: pointerdown fires first and sets false, then the button's
      // click toggles it straight back to true, so the panel appears stuck.
      if (accountRef.current?.contains(target) || accountButtonRef.current?.contains(target)) return;
      setAccountOpen(false);
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
      if (!active) return;
      setStored(entries);

      // An empty bag needs no server round trip, and most visitors have one.
      if (!entries.length) {
        setPricingFailed(false);
        setLines((current) => (current && !current.length ? current : []));
        return;
      }

      priceBag(entries)
        .then((priced) => {
          // A stale reply must not resurrect a line just removed.
          if (!active || mine !== ticket) return;
          setPricingFailed(false);
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
          if (!active || mine !== ticket) return;
          // Leave the last known contents rather than blanking the badge
          // because one request failed. On a first load there are none to
          // leave, though, and silence there reads as "your bag is empty" for a
          // bag that is not — so the drawer is told, and offers a retry.
          setPricingFailed(true);
        });
    };

    retryPricing.current = sync;

    // Deferred so the effect body itself never sets state.
    void Promise.resolve().then(() => {
      if (active) sync();
    });

    const unsubscribe = onCartChanged(sync);
    return () => {
      active = false;
      retryPricing.current = () => {};
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

  // Until the server answers the count comes from storage, so the badge is
  // right the moment the page is interactive. After it, the priced lines win —
  // they are the ones that know a product has since been withdrawn.
  const counted: { quantity: number }[] = lines ?? stored;
  const cartCount = counted.reduce((total, line) => total + line.quantity, 0);

  const cartStatus: MiniCartStatus = lines
    ? "ready"
    : pricingFailed
      ? "failed"
      : stored.length
        ? "pricing"
        : "ready";

  function openMega(category: NavCategory, trigger: HTMLAnchorElement) {
    megaTrigger.current = trigger;
    setMega(category);
    setAccountOpen(false);
  }

  /**
   * Checkout gets a stripped header — spec Sazuna Checkout.dc.html:60-66.
   *
   * No nav, no search, no bag: once someone is paying, every other link is an
   * exit. Still the shared component rather than a second header, so the logo,
   * the surface and the sticky behaviour cannot drift apart.
   */
  if (checkout) {
    return (
      <header
        ref={headerRef}
        className="sticky top-0 z-[60] border-b border-line bg-[var(--sz-header-bg)] backdrop-blur-[var(--sz-header-blur)]"
      >
        {/* The gutter pair is the checkout page's own (checkout/page.tsx), not
            the shell's, so the logo lines up with the form beneath it. The 18px
            step is a third distinct mobile gutter and should be reconciled with
            --sz-gutter-mobile across both files at once. */}
        <div className="mx-auto flex h-[var(--sz-checkout-header-h)] max-w-[var(--sz-container)] items-center justify-between gap-4 px-[var(--sz-gutter)] checkout-narrow:px-[18px]">
          <Link href="/" aria-label="Sazuna Jewellers — home" className="inline-flex shrink-0">
            <Image
              src="/sazuna-logo.webp"
              alt="Sazuna Jewellers"
              width={1130}
              height={240}
              priority
              className="block h-[var(--sz-logo-h-checkout)] w-auto"
            />
          </Link>
          <span className="inline-flex items-center gap-2 text-trust font-semibold text-muted">
            <Icon name="lock" size={15} strokeWidth={1.7} className="text-primary-700" />
            Secure checkout
          </span>
        </div>
      </header>
    );
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

      <div
        className="sticky top-0 z-[60]"
        // Hovering away closes the mega-menu — unless a keyboard user is
        // standing in it, in which case unmounting the panel would drop their
        // focus on <body>. A stray mouse movement should not do that.
        onMouseLeave={() => {
          if (!document.activeElement?.closest(`#${MEGA_PANEL_ID}`)) setMega(null);
        }}
      >
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
              className={cn(
                "hidden min-w-0 flex-1 items-center gap-px overflow-x-auto nav-expanded:flex",
                // Centred with auto margins rather than `justify-center`. When
                // centred flex content overflows a scroll container its leading
                // edge sits at a negative scroll offset that no scroll can
                // reach, so between 900px and ~1190px the first category was
                // cut off with no way to get to it. Auto margins only ever
                // distribute *positive* free space, so they centre when there
                // is room and collapse to zero when there is not.
                "[&>*:first-child]:ml-auto [&>*:last-child]:mr-auto",
              )}
            >
              {NAV_CATEGORIES.map((category) => {
                const open = mega?.slug === category.slug;
                return (
                  <Link
                    key={category.slug}
                    href={jewelleryUrl(category.slug)}
                    onMouseEnter={(event) => openMega(category, event.currentTarget)}
                    onFocus={(event) => openMega(category, event.currentTarget)}
                    // The disclosure pair: `aria-controls` only while the panel
                    // it names is actually in the document, or it points at
                    // nothing. ARIA 1.2 supports both on role=link.
                    aria-expanded={open}
                    aria-controls={open ? MEGA_PANEL_ID : undefined}
                    className={cn(navLinkClass, open && "bg-primary-50 text-primary-700")}
                  >
                    {category.label}
                  </Link>
                );
              })}

              {/* Rendered here, inside the nav, so the panel follows its own
                  trigger in the tab order — after </header> it could only be
                  reached by tabbing past every action button, and the featured
                  link closed it first. Position is unaffected: `absolute`
                  resolves against the sticky wrapper either way, and the nav's
                  overflow does not clip a box whose containing block is outside
                  it. */}
              {mega && <MegaMenu category={mega} />}

              <span aria-hidden="true" className="mx-1.5 h-4 w-px bg-line" />

              <Link
                href={jewelleryUrl(NAV_FEATURED.slug)}
                onMouseEnter={() => setMega(null)}
                // Safe on focus now that the panel precedes this link: reaching
                // it by keyboard means the reader has already tabbed through
                // the panel, so closing behind them is the right move.
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
                ref={accountButtonRef}
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
          // The alignment scaffolding is full-width and as tall as the panel,
          // so it must not take the pointer: transparent or not, it was eating
          // every click in the top of the page, and — being what accountRef
          // pointed at — the outside-click handler counted those clicks as
          // inside and refused to close. Only the panel itself takes events,
          // and only the panel is what "inside" means.
          <div className="pointer-events-none absolute inset-x-0 top-full z-[70]">
            <div className="mx-auto flex max-w-[var(--sz-container)] justify-end px-[var(--sz-gutter-mobile)] nav-expanded:px-[var(--sz-gutter)]">
              <div ref={accountRef} className="pointer-events-auto">
                <AccountMenu
                  customer={customer}
                  onRequestCode={onRequestCode}
                  onSubmitCode={onSubmitCode}
                  onLogOut={onLogOut}
                  devCode={devCode}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <MobileNav
        open={mobileNav}
        onClose={() => setMobileNav(false)}
        onSignIn={() => setAccountOpen(true)}
        signedIn={Boolean(customer)}
      />

      {/* Mounted open or shut, like the two drawers: it is a native <dialog>,
          and the platform can only restore focus to the search button if the
          element is still there to be closed. It re-reads recent searches on
          each open instead of at mount. */}
      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        whatsappHref={whatsappHref}
      />

      <MiniCart
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        lines={lines ?? []}
        count={cartCount}
        status={cartStatus}
        onRetry={() => retryPricing.current()}
        freeShipping={freeShipping}
        onRemove={(id) => removeFromCart(Number(id))}
        onQuantityChange={(id, quantity) => setQuantity(Number(id), quantity)}
      />
    </>
  );
}
