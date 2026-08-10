"use client";

import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { Icon, Skeleton, useDialog } from "@/components/ui";

/**
 * How much the drawer can trust `lines`.
 *
 * "pricing" and "failed" both mean *the bag is not empty* — the contents are
 * known, their prices are not. Collapsing either into an empty `lines` array is
 * how this drawer used to tell customers their bag was empty while the pricing
 * request was still in flight, and permanently if it never came back.
 */
export type MiniCartStatus = "ready" | "pricing" | "failed";

export interface MiniCartLine {
  id: string;
  name: string;
  /** Formatted, already localised. */
  price: string;
  /** The same amount in paisa, as an exact integer, for the subtotal. */
  priceMinor: number;
  quantity: number;
  href?: string;
  imageUrl?: string | null;
}

export interface MiniCartProps {
  open: boolean;
  onClose: () => void;
  lines?: MiniCartLine[];
  /**
   * Overrides the computed subtotal. The cart phase will pass a server-side
   * total that also knows about coupons; until then this is summed from lines.
   */
  subtotal?: string;
  /**
   * Overrides the piece count in the title. localStorage knows how many pieces
   * are in the bag before the server has priced any of them, so the heading and
   * the header's badge can agree from the first paint.
   */
  count?: number;
  /** Defaults to "ready", which is what a caller with priced lines has. */
  status?: MiniCartStatus;
  /** Re-runs a failed pricing request. One attempt, on the customer's ask. */
  onRetry?: () => void;
  /** True once the order qualifies for free insured shipping. */
  freeShipping?: boolean;
  onQuantityChange?: (id: string, quantity: number) => void;
  onRemove?: (id: string) => void;
}

const primaryButtonClass =
  "block w-full cursor-pointer rounded-[var(--sz-radius-control)] bg-primary-700 py-[13px] text-center text-control font-semibold text-white no-underline transition-colors duration-[var(--sz-dur-fast)] hover:bg-primary-800 hover:no-underline";

/**
 * Mini-cart drawer — spec §Mini-cart (SazunaHeader.dc.html:264-306).
 *
 * Rendered from props: there is no cart state yet, so the cart phase supplies
 * `lines` without this markup changing. Built on a native <dialog> so focus
 * trapping, Escape and the inert background come from the platform.
 */
export function MiniCart({
  open,
  onClose,
  lines = [],
  subtotal,
  count: countOverride,
  status = "ready",
  onRetry,
  freeShipping = false,
  onQuantityChange,
  onRemove,
}: MiniCartProps) {
  const { ref, onBackdropClick } = useDialog(open, onClose);
  const empty = lines.length === 0;
  // Pieces, not lines — two of the same ring is a bag of two. The header badge
  // counts the same way, so the two can never disagree.
  const count = countOverride ?? lines.reduce((sum, line) => sum + line.quantity, 0);

  // Summed in integer paisa, so several lines cannot drift the way repeated
  // float addition would.
  const total =
    subtotal ??
    formatPrice(lines.reduce((sum, line) => sum + line.priceMinor * line.quantity, 0) / 100) ??
    "";

  return (
    <dialog
      ref={ref}
      onClick={onBackdropClick}
      aria-labelledby="sz-cart-title"
      className="m-0 ml-auto h-dvh max-h-dvh w-[var(--sz-cart-w)] max-w-[92vw] bg-canvas p-0 text-body shadow-drawer backdrop:bg-[var(--sz-scrim)] backdrop:animate-fade open:animate-cart-in"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-line px-[22px] py-5">
          <h2
            id="sz-cart-title"
            className="font-[family-name:var(--sz-font-display)] text-dropdown-title font-medium text-heading"
          >
            Your Bag{" "}
            <span className="font-mono text-control-sm text-muted">({count})</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close bag"
            className="inline-flex cursor-pointer p-1 text-muted transition-colors duration-[var(--sz-dur-fast)] hover:text-heading"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        {status === "pricing" ? (
          /* Known contents, unknown prices. Placeholders for the rows the
             server is about to return — the empty state here would be a lie,
             and it is the one this drawer used to tell. */
          <div className="flex flex-1 flex-col gap-4 px-[22px] py-4">
            <p role="status" className="sr-only">
              Pricing your bag
            </p>
            {Array.from({ length: Math.min(Math.max(count, 1), 3) }, (_, row) => (
              <div key={row} className="flex gap-[13px]">
                <Skeleton className="h-[var(--sz-cart-thumb-h)] w-[var(--sz-cart-thumb-w)] shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="mt-auto h-7 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : status === "failed" ? (
          /* The bag is intact — only the round trip that prices it failed. It
             says so, and offers the one action that can fix it, because the
             alternative was a drawer that looked permanently empty. */
          <div className="flex flex-1 flex-col items-center justify-center px-8 py-10 text-center">
            <div className="flex size-16 items-center justify-center rounded-pill bg-error-soft text-error">
              <Icon name="alert" size={28} strokeWidth={1.5} />
            </div>
            <p className="m-0 mt-[18px] font-[family-name:var(--sz-font-display)] text-cart-empty-title text-heading">
              We couldn&rsquo;t price your bag
            </p>
            <p className="mb-5 mt-2 max-w-[32ch] text-sm text-muted">
              Your {count === 1 ? "piece is" : "pieces are"} still saved. Prices come from the
              shop, and we couldn&rsquo;t reach it just now.
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="cursor-pointer rounded-[var(--sz-radius-control)] bg-primary-700 px-[22px] py-3 text-sm font-semibold text-white transition-colors duration-[var(--sz-dur-fast)] hover:bg-primary-800"
            >
              Try again
            </button>
            <Link
              href="/cart"
              onClick={onClose}
              className="mt-2.5 cursor-pointer text-control-sm font-semibold text-primary-700 underline"
            >
              Open the full bag
            </Link>
          </div>
        ) : empty ? (
          <div className="flex flex-1 flex-col items-center justify-center px-8 py-10 text-center">
            <div className="flex size-16 items-center justify-center rounded-pill bg-surface text-accent-strong">
              <Icon name="bag" size={28} strokeWidth={1.5} />
            </div>
            <p className="m-0 mt-[18px] font-[family-name:var(--sz-font-display)] text-cart-empty-title text-heading">
              Your bag is empty
            </p>
            <p className="mb-5 mt-2 max-w-[32ch] text-sm text-muted">
              Certified diamonds, set in gold — find the one that&rsquo;s yours.
            </p>
            <Link
              href="/jewellery/best-seller.html"
              onClick={onClose}
              className="cursor-pointer rounded-[var(--sz-radius-control)] bg-primary-700 px-[22px] py-3 text-sm font-semibold text-white no-underline transition-colors duration-[var(--sz-dur-fast)] hover:bg-primary-800 hover:no-underline"
            >
              Browse bestsellers
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="mt-2.5 cursor-pointer text-control-sm font-semibold text-primary-700 underline"
            >
              Continue shopping
            </button>
          </div>
        ) : (
          <>
            {freeShipping && (
              <p className="m-0 flex items-center gap-2 bg-success-soft px-[22px] py-[9px] text-xs font-semibold text-success-ink">
                <Icon name="truck" size={15} strokeWidth={1.7} />
                Free insured shipping unlocked
              </p>
            )}

            <ul className="m-0 flex flex-1 list-none flex-col gap-4 overflow-y-auto overscroll-contain p-0 px-[22px] py-4">
              {lines.map((line) => (
                <li key={line.id} className="flex gap-[13px]">
                  <span className="relative flex h-[var(--sz-cart-thumb-h)] w-[var(--sz-cart-thumb-w)] shrink-0 items-center justify-center overflow-hidden rounded-[var(--sz-radius-control)] bg-[repeating-linear-gradient(135deg,var(--sz-line-soft)_0_9px,var(--sz-surface)_9px_18px)]">
                    {line.imageUrl ? (
                      <Image
                        src={line.imageUrl}
                        alt=""
                        fill
                        sizes="68px"
                        className="object-cover"
                      />
                    ) : (
                      <span className="size-5 rotate-45 bg-accent opacity-55" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    {/* The gap is exactly half of what the remove button's tap
                        target adds, so that target reaches the title's edge and
                        stops — no overlap, no clicks stolen from the link. */}
                    <div className="flex justify-between gap-3.5">
                      <span className="min-w-0">
                        {line.href ? (
                          <Link
                            href={line.href}
                            onClick={onClose}
                            className="font-[family-name:var(--sz-font-display)] text-control leading-[1.25] text-heading no-underline hover:underline"
                          >
                            {line.name}
                          </Link>
                        ) : (
                          <span className="font-[family-name:var(--sz-font-display)] text-control leading-[1.25] text-heading">
                            {line.name}
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemove?.(line.id)}
                        aria-label={`Remove ${line.name}`}
                        // 16px of icon inside a --sz-control-h tap target. The
                        // target is a pseudo-element rather than padding so it
                        // grows without moving the icon or reflowing the row.
                        // It is destructive and there is no undo, so the 16px
                        // it used to be was a mis-tap waiting to happen.
                        className="relative shrink-0 cursor-pointer p-0 text-muted-soft transition-colors duration-[var(--sz-dur-fast)] after:absolute after:left-1/2 after:top-1/2 after:size-[var(--sz-control-h)] after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] hover:text-error"
                      >
                        <Icon name="close" size={16} />
                      </button>
                    </div>

                    <div className="mt-[9px] flex items-center justify-between">
                      <span className="inline-flex items-center rounded-[var(--sz-radius-stepper)] border border-line">
                        <button
                          type="button"
                          onClick={() => onQuantityChange?.(line.id, line.quantity - 1)}
                          disabled={line.quantity <= 1}
                          aria-label={`Decrease quantity of ${line.name}`}
                          className="inline-flex size-7 cursor-pointer items-center justify-center text-primary-700 disabled:cursor-not-allowed disabled:opacity-[var(--sz-disabled-opacity)]"
                        >
                          <Icon name="minus" size={14} strokeWidth={1.8} />
                        </button>
                        <span className="w-[30px] border-x border-line text-center font-mono text-control-sm leading-7 text-heading">
                          {line.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => onQuantityChange?.(line.id, line.quantity + 1)}
                          aria-label={`Increase quantity of ${line.name}`}
                          className="inline-flex size-7 cursor-pointer items-center justify-center text-primary-700"
                        >
                          <Icon name="plus" size={14} strokeWidth={1.8} />
                        </button>
                      </span>

                      <span className="font-mono text-sm font-semibold tracking-tight text-primary-700">
                        {line.price}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="border-t border-line px-[22px] py-[18px]">
              <div className="mb-3.5 flex items-baseline justify-between">
                <span className="text-sm text-muted">Subtotal</span>
                <span className="font-mono text-md font-semibold tracking-tight text-primary-700">
                  {total}
                </span>
              </div>
              <Link href="/checkout" onClick={onClose} className={primaryButtonClass}>
                Checkout
              </Link>
              <Link
                href="/cart"
                onClick={onClose}
                className="mt-[9px] block w-full cursor-pointer rounded-[var(--sz-radius-control)] border border-line bg-transparent py-[11px] text-center text-sm font-semibold text-primary-700 no-underline transition-colors duration-[var(--sz-dur-fast)] hover:border-primary-700 hover:no-underline"
              >
                View bag
              </Link>
              <p className="m-0 mt-3 text-center text-xs text-muted">
                Cash on delivery available nationwide
              </p>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
