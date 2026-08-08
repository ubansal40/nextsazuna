"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import {
  insertAt,
  onCartChanged,
  readCart,
  removeFromCart,
  setQuantity,
  type CartEntry,
} from "@/lib/cart-storage";
import type { PricedCart } from "@/lib/cart";
import { Icon, ProductCard, QuantityStepper, Toggle } from "@/components/ui";
import type { ProductSummary } from "@/lib/catalog";
import { priceBag } from "../_actions";

type Status = "loading" | "ready" | "error";

const UNDO_MS = 5000;

const cardClass = "rounded-[var(--sz-radius-lg)] border border-line bg-raised p-4";

/**
 * The bag — spec Sazuna Cart.dc.html.
 *
 * A client component because the bag lives in the browser. It holds ids and
 * quantities only and asks the server to price them, so every figure shown
 * here — line prices, discount, total — is the server's, not localStorage's.
 */
export function CartView({
  browseHref,
  suggestions = [],
}: {
  browseHref: string;
  /** Shown under the empty state. Fetched on the server. */
  suggestions?: ProductSummary[];
}) {
  const [status, setStatus] = useState<Status>("loading");
  const [cart, setCart] = useState<PricedCart | null>(null);
  const [giftWrap, setGiftWrap] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [undo, setUndo] = useState<{ entry: CartEntry; index: number; name: string } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Re-price from whatever the browser currently holds.
   *
   * `code` and `giftWrap` go along because the totals depend on them, and the
   * server is the only thing allowed to decide what they are worth.
   *
   * Requests are sequenced: quantity changes fire in quick succession and a
   * slow early reply must never overwrite a later, correct one — that would
   * leave a total on screen that does not match the bag.
   */
  const request = useRef(0);

  const refresh = useCallback(() => {
    const ticket = ++request.current;
    priceBag(readCart(), { code: code ?? undefined, giftWrap })
      .then((priced) => {
        if (ticket !== request.current) return;
        setCart(priced);
        setStatus("ready");
      })
      .catch(() => {
        if (ticket === request.current) setStatus("error");
      });
  }, [code, giftWrap]);

  useEffect(refresh, [refresh]);

  // Carried to checkout, which reads the same key — otherwise the choice is
  // silently dropped at the moment it would be charged for.
  useEffect(() => {
    try {
      window.localStorage.setItem("sazuna:gift-wrap", giftWrap ? "1" : "0");
    } catch {
      // Not worth failing the bag over.
    }
  }, [giftWrap]);

  // Deferred: the first render also happens on the server, where storage does
  // not exist, so reading it synchronously would be a hydration mismatch.
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      try {
        setGiftWrap(window.localStorage.getItem("sazuna:gift-wrap") === "1");
      } catch {
        // Ignore.
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // Another tab, or the header's own add-to-bag, changed the contents.
  useEffect(() => onCartChanged(refresh), [refresh]);

  useEffect(() => {
    return () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    };
  }, []);

  function remove(line: PricedCart["lines"][number], index: number) {
    setConfirming(null);
    removeFromCart(line.productId);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo({
      entry: { productId: line.productId, quantity: line.quantity },
      index,
      name: line.name,
    });
    undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS);
  }

  function restore() {
    if (!undo) return;
    insertAt(undo.entry, undo.index);
    setUndo(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }

  async function applyPromo() {
    const value = promoInput.trim();
    if (!value) return;
    setCode(value);
  }

  if (status === "error") {
    return (
      <div className="mt-[26px] rounded-[var(--sz-radius-modal)] border border-line-soft bg-raised px-6 py-[90px] text-center">
        <span className="inline-flex size-[52px] items-center justify-center rounded-pill bg-primary-50 text-primary-700">
          <Icon name="alert" size={24} strokeWidth={1.8} />
        </span>
        <h1 className="m-0 mt-[18px] font-[family-name:var(--sz-font-display)] text-cart-h1 font-normal tracking-tight text-heading cart-stacked:text-h2-sm">
          We couldn&rsquo;t load your bag
        </h1>
        <p className="mx-auto mt-2.5 max-w-[38ch] text-prose leading-[1.6] text-muted">
          Something went wrong on our side. Please try again.
        </p>
        <button
          type="button"
          onClick={() => {
            setStatus("loading");
            refresh();
          }}
          className="mt-[22px] cursor-pointer rounded-[var(--sz-radius-thumb)] bg-primary-700 px-[26px] text-sm font-semibold text-white min-h-12 transition-colors duration-[var(--sz-dur-fast)] hover:bg-primary-800"
        >
          Try again
        </button>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div aria-busy="true" aria-label="Loading your bag">
        <div className="mt-[30px] h-5 w-[180px] rounded-[var(--sz-radius-sm)] bg-line-soft" />
        <div className="mt-[26px] grid items-start gap-10 cart-split:grid-cols-[minmax(0,1fr)_var(--sz-cart-summary)]">
          <div className="flex flex-col gap-3.5">
            {[0, 1, 2].map((row) => (
              <div key={row} className={cn(cardClass, "flex gap-4")}>
                <div className="h-[var(--sz-cart-line-thumb-h)] w-[var(--sz-cart-line-thumb-w)] shrink-0 overflow-hidden rounded-[var(--sz-radius-md)] bg-line-soft" />
                <div className="flex-1">
                  <div className="h-[15px] w-[64%] rounded-[var(--sz-radius-xs)] bg-line-soft" />
                  <div className="mt-3 h-3 w-[40%] rounded-[var(--sz-radius-xs)] bg-surface" />
                  <div className="mt-5 h-3.5 w-[30%] rounded-[var(--sz-radius-xs)] bg-line-soft" />
                </div>
              </div>
            ))}
          </div>
          <div className="h-[320px] rounded-[var(--sz-radius-xl)] bg-line-soft" />
        </div>
      </div>
    );
  }

  const lines = cart?.lines ?? [];

  if (lines.length === 0) {
    return (
      <div className="px-6 pb-3 pt-[70px] text-center">
        <div className="inline-flex size-[66px] items-center justify-center rounded-pill bg-surface text-accent-strong">
          <Icon name="bag" size={30} strokeWidth={1.5} />
        </div>
        <h1 className="m-0 mt-[22px] font-[family-name:var(--sz-font-display)] text-cart-h1 font-normal tracking-tight text-heading cart-stacked:text-h2-sm">
          Your bag is empty
        </h1>
        <p className="mx-auto mt-2.5 max-w-[40ch] text-control leading-[1.6] text-muted">
          Nothing here yet. Explore certified diamonds, set in gold — each piece one of a kind.
        </p>
        <Link
          href={browseHref}
          className="mt-6 inline-flex items-center gap-[9px] rounded-[var(--sz-radius-thumb)] bg-primary-700 px-[26px] text-sm font-semibold text-white no-underline min-h-[var(--sz-control-h-md)] transition-colors duration-[var(--sz-dur-fast)] hover:bg-primary-800 hover:text-white hover:no-underline"
        >
          Browse the collection
          <Icon name="arrow-right" size={15} strokeWidth={1.9} />
        </Link>

        {suggestions.length > 0 && (
          <div className="mt-14 text-left">
            <p className="m-0 mb-[22px] inline-flex items-center gap-2 font-mono text-2xs uppercase tracking-caps text-accent-strong">
              <span aria-hidden="true" className="size-[5px] rotate-45 bg-accent" />
              Bestsellers
            </p>
            <div className="grid grid-cols-4 gap-[22px] cart-stacked:grid-cols-2">
              {suggestions.map((product) => (
                <ProductCard
                  key={product.id}
                  title={product.name}
                  href={product.href}
                  price={product.price}
                  compareAtPrice={product.compareAtPrice ?? undefined}
                  image={
                    product.imageUrl ? { src: product.imageUrl, alt: product.name } : undefined
                  }
                  outOfStock={!product.inStock}
                  certified
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const totals = cart!.totals;
  const coupon = cart!.coupon;
  const applied = coupon?.ok === true;

  const promoError = coupon && !coupon.ok ? coupon.reason : null;
  const promoMessage =
    promoError === "expired"
      ? "This code has expired."
      : promoError === "not-started"
        ? "This code isn't active yet."
        : promoError === "used-up"
          ? "This code has been fully redeemed."
          : promoError === "min-subtotal"
            ? "Your bag doesn't reach this code's minimum."
            : promoError
              ? "That code isn't valid. Check the spelling."
              : null;

  return (
    <>
      <div className="mt-[26px] flex items-baseline gap-3">
        <h1 className="m-0 font-[family-name:var(--sz-font-display)] text-cart-h1 font-normal leading-[1.05] tracking-tight text-heading cart-stacked:text-h2-sm">
          Your Bag
        </h1>
        <span className="font-mono text-sm text-muted">
          {cart!.count} {cart!.count === 1 ? "piece" : "pieces"}
        </span>
      </div>

      <div className="mt-[26px] grid items-start gap-10 cart-stacked:mt-[18px] cart-stacked:gap-[26px] cart-split:grid-cols-[minmax(0,1fr)_var(--sz-cart-summary)]">
        <div className="flex flex-col gap-3.5">
          {lines.map((line, index) => (
            <div key={line.productId} className={cn(cardClass, "relative flex gap-4")}>
              <Link
                href={line.href}
                className="relative flex h-[var(--sz-cart-line-thumb-h)] w-[var(--sz-cart-line-thumb-w)] shrink-0 items-center justify-center overflow-hidden rounded-[var(--sz-radius-md)]"
                style={{
                  background:
                    "radial-gradient(120% 120% at 30% 22%, var(--sz-media-from), var(--sz-media-to))",
                }}
              >
                {line.imageUrl ? (
                  <Image src={line.imageUrl} alt="" fill sizes="84px" className="object-cover" />
                ) : (
                  <span
                    aria-hidden="true"
                    className="aspect-square w-[30%] rotate-45 bg-accent opacity-50"
                  />
                )}
              </Link>

              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={line.href}
                      className="block font-[family-name:var(--sz-font-display)] text-line-name leading-[1.25] text-heading no-underline hover:text-primary-700 hover:no-underline"
                    >
                      {line.name}
                    </Link>
                    {line.sku && (
                      <p className="m-0 mt-[5px] font-mono text-price-struck text-muted">
                        {line.sku}
                      </p>
                    )}
                    <p className="m-0 mt-2.5 inline-flex items-center gap-1.5 rounded-pill border border-sgl-border bg-sgl-bg px-[9px] py-1 text-2xs font-semibold text-primary-800">
                      <Icon name="shield" size={11} strokeWidth={1.8} />
                      SGL Certified
                    </p>
                  </div>

                  {/* Sale pricing is a hard design rule — see CLAUDE.md. */}
                  <div className="shrink-0 text-right">
                    <p
                      className={cn(
                        "m-0 whitespace-nowrap font-mono text-base font-semibold tabular-nums tracking-tight",
                        line.compareAtPrice ? "text-primary-700" : "text-heading",
                      )}
                    >
                      {line.price}
                    </p>
                    {line.compareAtPrice && (
                      <s className="mt-0.5 block whitespace-nowrap font-mono text-xs tabular-nums tracking-tight text-price-struck">
                        {line.compareAtPrice}
                      </s>
                    )}
                  </div>
                </div>

                <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-3.5">
                  <QuantityStepper
                    value={line.quantity}
                    min={1}
                    max={10}
                    label={`Quantity for ${line.name}`}
                    onValueChange={(next) => {
                      setQuantity(line.productId, next);
                    }}
                  />

                  {confirming === line.productId ? (
                    <span className="inline-flex items-center gap-2.5">
                      <span className="text-trust text-muted">Remove?</span>
                      <button
                        type="button"
                        onClick={() => remove(line, index)}
                        className="cursor-pointer px-1 py-2 text-trust font-semibold text-error min-h-10"
                      >
                        Yes, remove
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        className="cursor-pointer px-1 py-2 text-trust font-semibold text-muted min-h-10 hover:text-body"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(line.productId)}
                      aria-label={`Remove ${line.name}`}
                      className="inline-flex cursor-pointer items-center gap-1.5 px-1 py-2 text-trust font-semibold text-muted min-h-10 transition-colors duration-[var(--sz-dur-fast)] hover:text-error"
                    >
                      <Icon name="trash" size={15} />
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          <div className={cn(cardClass, "flex items-center gap-3.5")}>
            <span className="inline-flex size-[42px] shrink-0 items-center justify-center rounded-[11px] bg-primary-50 text-primary-700">
              <Icon name="gift" size={21} strokeWidth={1.5} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="m-0 text-prose font-semibold text-heading">Add gift wrap</p>
              <p className="m-0 mt-0.5 text-trust text-muted">
                Signature box, ribbon &amp; a handwritten note · {totals.giftWrapFee}
              </p>
            </div>
            <Toggle
              checked={giftWrap}
              onChange={(event) => setGiftWrap(event.target.checked)}
              aria-label="Add gift wrap"
            />
          </div>

          <Link
            href={browseHref}
            className="mt-1.5 inline-flex items-center gap-2 px-0.5 py-1.5 text-footer-link font-semibold text-primary-700 no-underline hover:text-primary-800 hover:no-underline"
          >
            <Icon name="arrow-left" size={16} strokeWidth={1.9} />
            Continue shopping
          </Link>
        </div>

        <aside
          aria-label="Order summary"
          className="cart-split:sticky cart-split:top-[var(--sz-sticky-offset)]"
        >
          <div className="rounded-[var(--sz-radius-xl)] border border-line bg-raised p-[22px]">
            <p className="m-0 mb-4 font-[family-name:var(--sz-font-display)] text-md font-medium text-heading">
              Summary
            </p>

            {applied ? (
              <div className="flex items-center justify-between gap-2.5 rounded-[var(--sz-radius-thumb)] border border-success-border bg-success-soft px-3 py-2.5">
                <span className="inline-flex items-center gap-2 text-trust font-semibold text-success">
                  <Icon name="check" size={14} strokeWidth={2} />
                  <span className="font-mono">{coupon.code}</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setCode(null);
                    setPromoInput("");
                  }}
                  className="shrink-0 cursor-pointer p-1.5 text-xs font-semibold text-muted underline"
                >
                  Remove
                </button>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <input
                    value={promoInput}
                    onChange={(event) => setPromoInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void applyPromo();
                    }}
                    aria-label="Promo code"
                    placeholder="Promo code"
                    className="min-w-0 flex-1 rounded-[var(--sz-radius-thumb)] border border-line bg-canvas px-3 text-sm text-heading outline-none min-h-[var(--sz-notify-input-h)] transition-[border-color,box-shadow] duration-[var(--sz-dur)] ease-[var(--sz-ease-out)] focus-visible:border-primary-700 focus-visible:shadow-[var(--sz-ring-focus-soft)]"
                  />
                  <button
                    type="button"
                    onClick={() => void applyPromo()}
                    className="shrink-0 cursor-pointer rounded-[var(--sz-radius-thumb)] border border-primary-200 bg-raised px-[18px] text-footer-link font-semibold text-primary-700 min-h-[var(--sz-notify-input-h)] transition-colors duration-[var(--sz-dur-fast)] hover:border-primary-700 hover:bg-primary-50"
                  >
                    Apply
                  </button>
                </div>
                {promoMessage && (
                  <p role="alert" className="m-0 mt-[7px] text-xs text-error">
                    {promoMessage}
                  </p>
                )}
              </>
            )}

            <div className="mt-4 border-t border-line-soft pt-4">
              <div className="flex justify-between py-[3px] text-control-sm text-muted">
                <span>Subtotal</span>
                <span className="font-mono tabular-nums text-body">{totals.subtotal}</span>
              </div>
              {applied && totals.discountMinor > 0 && (
                <div className="flex justify-between py-[3px] text-control-sm text-success">
                  <span>Promo ({coupon.code})</span>
                  <span className="font-mono tabular-nums">−{totals.discount}</span>
                </div>
              )}
              {giftWrap && (
                <div className="flex justify-between py-[3px] text-control-sm text-muted">
                  <span>Gift wrap</span>
                  <span className="font-mono tabular-nums text-body">{totals.giftWrap}</span>
                </div>
              )}
              <div className="mt-2 flex items-baseline justify-between border-t border-line-soft pt-3">
                <span className="text-sm font-semibold text-heading">Total</span>
                <span className="font-mono text-summary-total font-semibold tabular-nums tracking-tight text-primary-700">
                  {totals.total}
                </span>
              </div>
            </div>

            <Link
              href="/checkout"
              className="mt-[18px] flex w-full items-center justify-center gap-[9px] rounded-md bg-primary-700 text-control font-semibold text-white no-underline min-h-[var(--sz-control-h-lg)] transition-colors duration-[var(--sz-dur-fast)] hover:bg-primary-800 hover:text-white hover:no-underline"
            >
              Proceed to Checkout
              <Icon name="arrow-right" size={16} strokeWidth={1.9} />
            </Link>

            <div className="mt-4 flex items-center justify-center gap-4">
              <span className="inline-flex items-center gap-[7px] text-offer font-semibold text-primary-800">
                <span className="inline-flex size-5 items-center justify-center rounded-[var(--sz-radius-sm)] bg-primary-800 text-accent">
                  <Icon name="shield-check" size={12} strokeWidth={1.7} />
                </span>
                SGL Certified
              </span>
              <span className="inline-flex items-center gap-[7px] text-offer font-semibold text-body">
                <span className="text-primary-700">
                  <Icon name="truck" size={16} strokeWidth={1.5} />
                </span>
                Insured Shipping
              </span>
            </div>
          </div>
        </aside>
      </div>

      {/* Mobile total bar. Hidden once the footer arrives, like every other
          bottom-pinned element in the shell. */}
      <div className="fixed inset-x-0 bottom-0 z-[850] hidden items-center gap-3.5 border-t border-line bg-[rgb(var(--sz-canvas-rgb)/.97)] px-4 pb-[calc(10px+env(safe-area-inset-bottom))] pt-2.5 backdrop-blur-[10px] cart-stacked:flex">
        <div className="shrink-0">
          <p className="m-0 text-2xs leading-none text-muted">Total</p>
          <p className="m-0 font-mono text-summary-total font-semibold leading-[1.3] tracking-tight text-primary-700">
            {totals.total}
          </p>
        </div>
        <Link
          href="/checkout"
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-[var(--sz-radius-sticky)] bg-primary-700 text-control font-semibold text-white no-underline min-h-[var(--sz-control-h-lg)] transition-colors duration-[var(--sz-dur-fast)] hover:bg-primary-800 hover:text-white hover:no-underline"
        >
          Checkout
        </Link>
      </div>

      {undo && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-8 left-1/2 z-[100000] inline-flex -translate-x-1/2 items-center gap-4 rounded-[var(--sz-radius-snackbar)] bg-body py-3 pl-5 pr-3.5 text-prose font-medium text-canvas shadow-lg animate-sheet-up"
        >
          Removed {undo.name}
          <button
            type="button"
            onClick={restore}
            className="cursor-pointer px-2 py-1.5 text-control-sm font-bold text-ann-text min-h-10"
          >
            Undo
          </button>
        </div>
      )}
    </>
  );
}
