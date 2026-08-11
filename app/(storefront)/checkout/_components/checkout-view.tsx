"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { onCartChanged, readCart, type CartEntry } from "@/lib/cart-storage";
import { normalisePhone } from "@/lib/order-lookup";
import { Icon, type IconName } from "@/components/ui";
import { placeOrder, quoteCheckout, type CheckoutQuote } from "../_actions";

type Flow = "loading" | "form" | "submitting" | "redirecting" | "success" | "failure";

const DRAFT_KEY = "sazuna:checkout-draft";

/**
 * A stable fingerprint of the bag, used to check that what is about to be
 * ordered is still what was quoted.
 *
 * Sorted, because line order does not change any figure: restoring a removed
 * line at a different position must not read as "your bag changed".
 */
function bagSignature(entries: CartEntry[]): string {
  return entries
    .map((entry) => `${entry.productId}:${entry.quantity}`)
    .sort()
    .join(",");
}

/**
 * Why an order was refused, in words. Every one of these is recoverable — the
 * customer is told what happened and the quote is refreshed underneath them.
 * "failed" is the only outcome that goes to the failure panel.
 */
const REFUSAL: Record<"empty" | "invalid" | "unavailable" | "changed", string> = {
  empty: "Your bag is empty, so nothing was ordered.",
  invalid: "We need your name, delivery address and phone number to place the order.",
  unavailable: "That payment method isn't available right now — please choose another.",
  changed:
    "Your bag changed while you were here, so the total did too. Check the updated total, then place your order.",
};

const METHOD_ICON: Record<string, IconName> = {
  cod: "card",
  esewa: "wallet",
  khalti: "receipt",
  cybersource: "card",
};

const panelClass =
  "mt-7 rounded-[var(--sz-radius-modal)] border border-line-soft bg-raised px-6 text-center";

// No focus ring here: the global :focus-visible rule owns it (CLAUDE.md). The
// soft ring this used to set was ~1.3:1 against the raised surface and beat the
// global one on specificity, so focused fields read as unfocused.
const fieldClass =
  "w-full rounded-[var(--sz-radius-thumb)] border bg-raised px-3.5 text-prose text-heading outline-none min-h-[var(--sz-field-h)] transition-[border-color] duration-[var(--sz-dur)] ease-[var(--sz-ease-out)] focus-visible:border-accent";

const labelClass = "mb-[7px] block text-control-sm font-semibold text-body";

/**
 * Checkout — spec Sazuna Checkout.dc.html.
 *
 * The bag lives in the browser, so this is a client component; every figure it
 * shows is quoted by the server, and placing the order re-derives all of them
 * again rather than trusting what is on screen.
 */
export function CheckoutView({
  browseHref,
  whatsappHref,
  failed = false,
}: {
  browseHref: string;
  whatsappHref?: string | null;
  failed?: boolean;
}) {
  const router = useRouter();
  const [flow, setFlow] = useState<Flow>(failed ? "failure" : "loading");
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [method, setMethod] = useState("cod");
  const [giftWrap, setGiftWrap] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [promoInput, setPromoInput] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [mobileSummary, setMobileSummary] = useState(false);
  /** Set whenever an order is refused, so no click is ever silently swallowed. */
  const [notice, setNotice] = useState<string | null>(null);
  /** A quote is in flight, so the figure on the button is not final yet. */
  const [pricing, setPricing] = useState(false);

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);

  const request = useRef(0);
  const payForm = useRef<HTMLFormElement>(null);
  const [redirect, setRedirect] = useState<{ action: string; fields: Record<string, string> } | null>(
    null,
  );

  /**
   * False until the saved draft has been read. Gates the persist effect below.
   *
   * State rather than a ref, and that is the point: the persist effect must not
   * run at all until the render it closes over carries the restored draft.
   * React flushes every passive effect before it drains the microtask queue, so
   * deferring the read into a microtask — as this used to — let persist run
   * first, with the initial empty state, and overwrite the draft before it was
   * ever read. The failure panel promises "your details are saved"; they were
   * being destroyed on mount. With the gate, declaration order no longer
   * matters.
   */
  const [restored, setRestored] = useState(false);

  /** The bag the current quote was priced from — see `submit`. */
  const quoted = useRef<CartEntry[] | null>(null);

  /**
   * Pick up what the browser already knows: the saved delivery draft, so a
   * failed payment does not cost the customer their address twice, and the
   * gift-wrap choice made in the bag.
   *
   * Read synchronously: an effect runs after hydration has committed, so there
   * is no server/client mismatch here to defer around.
   */
  useEffect(() => {
    try {
      // Read after hydration, not during render: reading localStorage while
      // rendering would make the server and client trees disagree. The hooks rule
      // below guards against cascading renders, which is the right default — this
      // is the case it cannot express. It runs once and costs one extra render,
      // and there is no SSR-safe render-time alternative.
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as Record<string, unknown>;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (typeof draft.name === "string") setName(draft.name);
        if (typeof draft.address === "string") setAddress(draft.address);
        if (typeof draft.phone === "string") setPhone(draft.phone);
        if (typeof draft.email === "string") setEmail(draft.email);
      }
      setGiftWrap(window.localStorage.getItem("sazuna:gift-wrap") === "1");
    } catch {
      // A corrupt draft is not worth failing checkout over.
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ name, address, phone, email }));
    } catch {
      // Storage full or blocked — the form still works for this visit.
    }
  }, [restored, name, address, phone, email]);

  /*
   * The phone, but only once it is a whole number, and reduced to its ten
   * digits so a re-typed "+977" prefix is not a different value.
   *
   * A coupon can carry a per-customer limit, and the server can only tell us it
   * bites if it knows who is asking. Deriving a stable key rather than passing
   * `phone` straight through is what stops the quote re-firing on every
   * keystroke: this changes exactly twice — once when the number completes, and
   * again only if it is genuinely replaced.
   */
  const quotePhone = normalisePhone(phone).length === 10 ? normalisePhone(phone) : "";

  const refresh = useCallback(() => {
    const ticket = ++request.current;
    // Remember exactly what went to the server; `submit` refuses to order a bag
    // that no longer matches it.
    const entries = readCart();
    setPricing(true);
    quoteCheckout(entries, { code: code ?? undefined, giftWrap, method, phone: quotePhone })
      .then((next) => {
        if (ticket !== request.current) return;
        quoted.current = entries;
        setQuote(next);
        setPricing(false);
        setFlow((current) => (current === "loading" ? "form" : current));
      })
      .catch(() => {
        if (ticket !== request.current) return;
        setPricing(false);
        setFlow("failure");
      });
  }, [code, giftWrap, method, quotePhone]);

  // `refresh` raises the pending flag before it awaits — that is what a pending
  // flag is for, and the alternative is a button that looks live while a quote
  // is in flight. One extra render on mount, by design.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(refresh, [refresh]);

  /*
   * The bag can move while checkout is open — another tab, or the header's own
   * add-to-bag. Without this the summary quietly describes a bag that no longer
   * exists, and the customer is asked to agree to the wrong figure.
   *
   * Only while the form is the thing on screen: the confirmation page clears
   * the bag, and re-quoting during a hand-off would swap the spinner for "your
   * bag is empty" on the way out.
   */
  useEffect(() => {
    if (flow !== "form") return;
    return onCartChanged(refresh);
  }, [flow, refresh]);

  // A refusal that nobody sees is a button that does nothing. Move to it.
  useEffect(() => {
    if (notice) document.getElementById("co-notice")?.focus();
  }, [notice]);

  // Post to the gateway once its signed fields are in the DOM.
  useEffect(() => {
    if (redirect && payForm.current) payForm.current.submit();
  }, [redirect]);

  const nameError = (submitted || touched.name) && !name.trim();
  const addressError = (submitted || touched.address) && !address.trim();
  const phoneError = (submitted || touched.phone) && phone.replace(/\D/g, "").length < 7;

  async function submit() {
    setSubmitted(true);
    setNotice(null);
    if (!name.trim() || !address.trim() || phone.replace(/\D/g, "").length < 7) {
      const target = !name.trim() ? "co-name" : !address.trim() ? "co-addr" : "co-phone";
      document.getElementById(target)?.focus();
      return;
    }

    /*
     * The customer agreed to one figure: the one on this button. Ordering the
     * bag as it stands *now* would let a change made since the quote — in
     * another tab, or by the header's add-to-bag — be re-priced by the server
     * and charged without ever being shown. So the bag that was quoted is what
     * gets ordered, and only if it is still the bag the browser holds.
     */
    const entries = quoted.current;
    if (!quote || !entries || bagSignature(entries) !== bagSignature(readCart())) {
      setNotice(REFUSAL.changed);
      refresh();
      return;
    }

    setFlow("submitting");
    const result = await placeOrder({
      entries,
      // Belt to that braces: the server refuses to write an order whose total
      // does not come to this exact figure in paisa. Catches drift the browser
      // cannot see — a price edit, a coupon lapsing mid-checkout.
      expectedTotalMinor: quote.totalMinor,
      code: code ?? undefined,
      giftWrap,
      method,
      name,
      phone,
      email,
      address,
    });

    if (!result.ok) {
      if (result.error === "failed") {
        setFlow("failure");
        return;
      }
      // Nothing was charged and nothing was written. Say what happened, and
      // re-quote so the screen agrees with the bag again — an emptied bag
      // falls through to the empty-bag panel on the next render.
      setFlow("form");
      setNotice(REFUSAL[result.error]);
      refresh();
      return;
    }

    setOrderNumber(result.orderNumber);

    if (result.kind === "placed") {
      // Cash orders land on the same receipt as a gateway return, so there is
      // one confirmation surface and the URL is shareable. That page clears
      // the bag once it has confirmed the order really exists.
      router.replace(
        `/checkout/confirmation?order=${encodeURIComponent(result.orderNumber)}&token=${encodeURIComponent(result.token)}`,
      );
      return;
    }

    setFlow("redirecting");

    // Khalti prepares its own payment page server-side, so there is nothing to
    // post — just go there.
    if (result.kind === "navigate") {
      window.location.assign(result.url);
      return;
    }

    setRedirect({ action: result.action, fields: result.fields });
  }

  if (flow === "loading") {
    return (
      <div className="mt-7 h-[320px] animate-pulse rounded-[var(--sz-radius-modal)] bg-line-soft" />
    );
  }

  if (flow === "success") {
    return (
      <div className={cn(panelClass, "py-20 animate-sheet-up")}>
        <span className="inline-flex size-[60px] items-center justify-center rounded-pill bg-success-soft text-success">
          <Icon name="check" size={30} strokeWidth={2.2} />
        </span>
        <h1 className="m-0 mt-[22px] font-[family-name:var(--sz-font-display)] text-h2 font-normal tracking-tight text-heading checkout-stacked:text-h2-sm">
          Order placed
        </h1>
        <p className="mx-auto mt-2.5 max-w-[44ch] text-control leading-[1.6] text-muted">
          Thank you. Your order <strong className="font-mono text-body">{orderNumber}</strong> is
          confirmed — we&rsquo;ll be in touch shortly to arrange delivery.
        </p>
        <div className="mt-[26px] flex flex-wrap justify-center gap-3">
          <Link
            href={browseHref}
            className="inline-flex items-center justify-center rounded-[var(--sz-radius-thumb)] bg-primary-700 px-6 text-sm font-semibold text-white no-underline min-h-12 hover:bg-primary-800 hover:text-white hover:no-underline"
          >
            Continue shopping
          </Link>
        </div>
      </div>
    );
  }

  if (flow === "redirecting") {
    return (
      <>
        <div className={cn(panelClass, "py-[90px]")}>
          <span className="inline-block size-10 animate-spin rounded-pill border-[3px] border-line border-t-primary-700" />
          <h1 className="m-0 mt-6 font-[family-name:var(--sz-font-display)] text-xl font-medium text-heading">
            Redirecting to secure payment
          </h1>
          <p className="mx-auto mt-2.5 max-w-[40ch] text-prose leading-[1.6] text-muted">
            Taking you to <strong className="text-body">{quote?.methods.find((m) => m.code === method)?.label}</strong>{" "}
            to complete your payment securely. Please don&rsquo;t close this window.
          </p>
        </div>
        {/* Signed by the server; the browser only relays it. */}
        {redirect && (
          <form ref={payForm} action={redirect.action} method="POST" className="hidden">
            {Object.entries(redirect.fields).map(([key, value]) => (
              <input key={key} type="hidden" name={key} value={value} readOnly />
            ))}
          </form>
        )}
      </>
    );
  }

  if (flow === "failure") {
    return (
      <div className={cn(panelClass, "py-20")}>
        <span className="inline-flex size-14 items-center justify-center rounded-pill bg-primary-50 text-primary-700">
          <Icon name="alert" size={26} strokeWidth={1.8} />
        </span>
        <h1 className="m-0 mt-5 font-[family-name:var(--sz-font-display)] text-h2 font-normal tracking-tight text-heading checkout-stacked:text-h2-sm">
          Payment didn&rsquo;t go through
        </h1>
        <p className="mx-auto mt-2.5 max-w-[42ch] text-prose leading-[1.6] text-muted">
          No charge was made and your details are saved. You can try again, or reach us on WhatsApp
          and we&rsquo;ll help you complete the order.
        </p>
        <div className="mt-[26px] flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              setFlow("form");
              setNotice(null);
              refresh();
            }}
            className="cursor-pointer rounded-[var(--sz-radius-thumb)] bg-primary-700 px-[26px] text-sm font-semibold text-white min-h-12 hover:bg-primary-800"
          >
            Try again
          </button>
          {whatsappHref && (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-[9px] rounded-[var(--sz-radius-thumb)] border border-primary-200 bg-raised px-[22px] text-sm font-semibold text-primary-700 no-underline min-h-12 hover:border-primary-700 hover:bg-primary-50 hover:no-underline"
            >
              <Icon name="whatsapp-solid" size={16} />
              WhatsApp support
            </a>
          )}
        </div>
      </div>
    );
  }

  if (!quote || quote.lines.length === 0) {
    return (
      <div className={cn(panelClass, "py-[90px]")}>
        <div className="inline-flex size-16 items-center justify-center rounded-pill bg-surface text-accent-strong">
          <Icon name="bag" size={28} strokeWidth={1.5} />
        </div>
        <h1 className="m-0 mt-[22px] font-[family-name:var(--sz-font-display)] text-h2 font-normal tracking-tight text-heading checkout-stacked:text-h2-sm">
          Your bag is empty
        </h1>
        <p className="mx-auto mt-2.5 max-w-[40ch] text-control leading-[1.6] text-muted">
          There&rsquo;s nothing to check out yet. Explore certified diamonds, set in gold.
        </p>
        <Link
          href={browseHref}
          className="mt-[26px] inline-flex items-center gap-[9px] rounded-[var(--sz-radius-thumb)] bg-primary-700 px-[26px] text-sm font-semibold text-white no-underline min-h-[var(--sz-control-h-md)] hover:bg-primary-800 hover:text-white hover:no-underline"
        >
          Browse the collection
          <Icon name="arrow-right" size={15} strokeWidth={1.9} />
        </Link>
      </div>
    );
  }

  const busy = flow === "submitting";
  const placeLabel = `Place Order · ${quote.total}`;

  const summaryRows = (
    <>
      <div className="flex justify-between py-[3px] text-control-sm text-muted">
        <span>Subtotal</span>
        <span className="font-mono tabular-nums text-body">{quote.subtotal}</span>
      </div>
      {quote.couponApplied && (
        <div className="flex justify-between py-[3px] text-control-sm text-success">
          <span>Promo ({quote.couponCode})</span>
          <span className="font-mono tabular-nums">−{quote.discount}</span>
        </div>
      )}
      {giftWrap && (
        <div className="flex justify-between py-[3px] text-control-sm text-muted">
          <span>Gift wrap</span>
          <span className="font-mono tabular-nums text-body">{quote.giftWrap}</span>
        </div>
      )}
      {quote.methods.find((m) => m.code === method)?.surchargePercent ? (
        <div className="flex justify-between py-[3px] text-control-sm text-muted">
          <span>Card surcharge ({quote.methods.find((m) => m.code === method)?.surchargePercent}%)</span>
          <span className="font-mono tabular-nums text-body">+{quote.surcharge}</span>
        </div>
      ) : null}
      <div className="mt-2 flex items-baseline justify-between border-t border-line-soft pt-3">
        <span className="text-sm font-semibold text-heading">Total</span>
        <span className="font-mono text-summary-total font-semibold tabular-nums tracking-tight text-primary-700">
          {quote.total}
        </span>
      </div>
    </>
  );

  const placeButton = (extra?: string) => (
    <button
      type="button"
      onClick={submit}
      // Held while a quote is in flight: for those few hundred milliseconds the
      // figure beside "Place Order" is not the one that would be charged.
      disabled={busy || pricing}
      aria-busy={busy}
      className={cn(
        "flex w-full cursor-pointer items-center justify-center gap-[9px] bg-primary-700 text-control font-semibold text-white min-h-[var(--sz-control-h-lg)] transition-colors duration-[var(--sz-dur-fast)] hover:bg-primary-800 disabled:cursor-wait",
        extra ?? "mt-[18px] rounded-md",
      )}
    >
      {busy ? (
        <>
          <span className="size-[18px] animate-spin rounded-pill border-[2.5px] border-[rgb(255_255_255/.45)] border-t-white" />
          Placing order…
        </>
      ) : (
        placeLabel
      )}
    </button>
  );

  return (
    <div className="mt-[18px] grid items-start gap-10 checkout-stacked:gap-0 checkout-split:grid-cols-[minmax(0,1fr)_var(--sz-checkout-summary)]">
      <div>
        {/* Why the last attempt did not become an order. Focused when it
            appears, because on mobile the button that was pressed is pinned to
            the bottom of the screen and this is at the top. */}
        {notice && (
          <p
            id="co-notice"
            role="alert"
            tabIndex={-1}
            className="m-0 mb-[18px] flex gap-2.5 rounded-[var(--sz-radius-md)] border border-error-border bg-error-soft p-3.5 text-sm leading-relaxed text-body"
          >
            <Icon name="alert" size={17} className="mt-0.5 flex-none text-error" />
            {notice}
          </p>
        )}

        {/* Mobile: the summary collapses so the form is the first thing seen. */}
        <div className="mb-[22px] hidden checkout-stacked:block">
          <button
            type="button"
            onClick={() => setMobileSummary((open) => !open)}
            aria-expanded={mobileSummary}
            className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-[var(--sz-radius-card)] border border-line bg-raised px-4 py-[15px] text-left"
          >
            <span className="inline-flex items-center gap-[9px] text-sm font-semibold text-heading">
              <Icon name="bag" size={17} strokeWidth={1.7} className="text-primary-700" />
              Order summary <span className="font-mono text-xs text-muted">({quote.itemCount})</span>
            </span>
            <span className="inline-flex items-center gap-2.5">
              <span className="font-mono text-control font-semibold tabular-nums tracking-tight text-primary-700">
                {quote.total}
              </span>
              <Icon
                name="chevron-down"
                size={16}
                strokeWidth={2}
                className={cn(
                  "text-muted transition-transform duration-[var(--sz-dur-condense)]",
                  mobileSummary && "rotate-180",
                )}
              />
            </span>
          </button>
          {mobileSummary && (
            <div className="-mt-px rounded-b-[var(--sz-radius-card)] border border-t-0 border-line p-4">
              {quote.lines.map((line) => (
                <div key={line.productId} className="mb-3.5 flex gap-3">
                  <SummaryThumb line={line} small />
                  <div className="min-w-0 flex-1">
                    <p className="m-0 font-[family-name:var(--sz-font-display)] text-prose leading-[1.25] text-heading">
                      {line.name}
                    </p>
                    <p className="m-0 mt-[3px] font-mono text-2xs text-muted">
                      {line.sku}
                      {line.quantity > 1 && ` · ×${line.quantity}`}
                    </p>
                  </div>
                  <p className="m-0 whitespace-nowrap font-mono text-control-sm tabular-nums text-body">
                    {line.price}
                  </p>
                </div>
              ))}
              <div className="mt-0.5 border-t border-line-soft pt-3">{summaryRows}</div>
            </div>
          )}
        </div>

        <section aria-labelledby="co-delivery-h" className="mt-1.5">
          <h2
            id="co-delivery-h"
            className="m-0 mb-1 font-[family-name:var(--sz-font-display)] text-accordion font-medium text-heading"
          >
            Delivery details
          </h2>
          <div className="flex flex-col gap-[13px]">
            <div>
              <label htmlFor="co-name" className={labelClass}>
                Full name <span className="text-primary-700">*</span>
              </label>
              <input
                id="co-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                aria-required="true"
                aria-invalid={nameError}
                aria-describedby={nameError ? "co-name-err" : undefined}
                autoComplete="name"
                placeholder="e.g. Ananya Sharma"
                className={cn(fieldClass, nameError ? "border-error-border" : "border-line")}
              />
              {nameError && <FieldError id="co-name-err">Please enter your full name</FieldError>}
            </div>

            <div>
              <label htmlFor="co-addr" className={labelClass}>
                Delivery address <span className="text-primary-700">*</span>
              </label>
              <input
                id="co-addr"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, address: true }))}
                aria-required="true"
                aria-invalid={addressError}
                aria-describedby={addressError ? "co-addr-err" : undefined}
                autoComplete="street-address"
                placeholder="House / tole, street, city, ward, landmark"
                className={cn(fieldClass, addressError ? "border-error-border" : "border-line")}
              />
              {addressError && (
                <FieldError id="co-addr-err">Please enter a delivery address</FieldError>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3.5 checkout-narrow:grid-cols-1">
              <div>
                <label htmlFor="co-phone" className={labelClass}>
                  Phone <span className="text-primary-700">*</span>
                </label>
                <input
                  id="co-phone"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
                  aria-required="true"
                  aria-invalid={phoneError}
                  aria-describedby={phoneError ? "co-phone-err" : undefined}
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="98XXXXXXXX"
                  className={cn(fieldClass, phoneError ? "border-error-border" : "border-line")}
                />
                {phoneError && (
                  <FieldError id="co-phone-err">We need a number to arrange delivery</FieldError>
                )}
              </div>
              <div>
                <label htmlFor="co-email" className={labelClass}>
                  Email <span className="font-normal text-muted-soft">(optional)</span>
                </label>
                <input
                  id="co-email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@email.com"
                  className={cn(fieldClass, "border-line")}
                />
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="co-pay-h" className="mt-[26px]">
          <h2
            id="co-pay-h"
            className="m-0 mb-4 font-[family-name:var(--sz-font-display)] text-accordion font-medium text-heading"
          >
            Payment method
          </h2>
          <div
            role="radiogroup"
            aria-label="Payment method"
            onKeyDown={(event) => {
              const delta = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
              if (!delta) return;
              event.preventDefault();
              const codes = quote.methods.map((m) => m.code);
              const index = codes.indexOf(method as (typeof codes)[number]);
              setMethod(codes[(index + delta + codes.length) % codes.length]);
            }}
            className="flex flex-col gap-3"
          >
            {quote.methods.map((option) => {
              const selected = option.code === method;
              return (
                <button
                  key={option.code}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setMethod(option.code)}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-3.5 rounded-[var(--sz-radius-card)] border-[1.5px] p-4 text-left transition-colors duration-[var(--sz-dur-fast)]",
                    selected ? "border-primary-700 bg-sgl-bg" : "border-line bg-raised",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex size-[var(--sz-radio-outer)] shrink-0 items-center justify-center rounded-pill border-[1.5px]",
                      selected ? "border-primary-700" : "border-control-border",
                    )}
                  >
                    {selected && (
                      <span className="size-[var(--sz-radio-inner)] rounded-pill bg-primary-700" />
                    )}
                  </span>
                  <span className="shrink-0 text-primary-700">
                    <Icon name={METHOD_ICON[option.code] ?? "card"} size={22} strokeWidth={1.5} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-prose font-semibold text-heading">
                      {option.label}
                    </span>
                    <span className="mt-0.5 block text-trust text-muted">{option.description}</span>
                  </span>
                  <span className="shrink-0 rounded-[var(--sz-radius-sm)] bg-surface px-2 py-[5px] font-mono text-eyebrow tracking-esc text-muted">
                    {option.tag}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="co-promo-h" className="mt-[26px]">
          <h2
            id="co-promo-h"
            className="m-0 mb-3.5 font-[family-name:var(--sz-font-display)] text-accordion font-medium text-heading"
          >
            Promo code
          </h2>
          {quote.couponApplied ? (
            <div className="flex items-center justify-between gap-3 rounded-[var(--sz-radius-md)] border border-success-border bg-success-soft px-3.5 py-3">
              <span className="inline-flex items-center gap-[9px] text-footer-link font-semibold text-success">
                <Icon name="check" size={16} strokeWidth={2} />
                <span className="font-mono">{quote.couponCode}</span> applied · −{quote.discount}
              </span>
              <button
                type="button"
                onClick={() => {
                  setCode(null);
                  setPromoInput("");
                }}
                className="shrink-0 cursor-pointer p-1.5 text-trust font-semibold text-muted underline"
              >
                Remove
              </button>
            </div>
          ) : (
            <>
              <div className="flex gap-2.5">
                <input
                  value={promoInput}
                  onChange={(event) => setPromoInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && promoInput.trim()) setCode(promoInput.trim());
                  }}
                  aria-label="Promo code"
                  placeholder="Enter code"
                  className={cn(fieldClass, "flex-1 border-line")}
                />
                <button
                  type="button"
                  onClick={() => promoInput.trim() && setCode(promoInput.trim())}
                  className="shrink-0 cursor-pointer rounded-[var(--sz-radius-thumb)] border border-primary-200 bg-raised px-[22px] text-sm font-semibold text-primary-700 min-h-[var(--sz-field-h)] transition-colors duration-[var(--sz-dur-fast)] hover:border-primary-700 hover:bg-primary-50"
                >
                  Apply
                </button>
              </div>
              {quote.couponError && (
                <p role="alert" className="m-0 mt-2 text-trust text-error">
                  {quote.couponError}
                </p>
              )}
            </>
          )}
        </section>

        <div className="mt-6 flex flex-wrap items-center gap-x-[18px] gap-y-2.5 border-t border-line-soft pt-[18px]">
          <span className="inline-flex items-center gap-2 text-trust font-semibold text-primary-800">
            <span className="inline-flex size-6 items-center justify-center rounded-[7px] bg-primary-800 text-accent">
              <Icon name="shield-check" size={14} strokeWidth={1.6} />
            </span>
            SGL Certified
          </span>
          <span className="inline-flex items-center gap-2 text-trust font-semibold text-body">
            <span className="text-primary-700">
              <Icon name="truck" size={18} strokeWidth={1.5} />
            </span>
            Insured Shipping
          </span>
        </div>
      </div>

      <aside
        aria-label="Order summary"
        className="hidden checkout-split:block checkout-split:sticky checkout-split:top-[calc(var(--sz-checkout-header-h)+var(--sz-space-16))]"
      >
        <div className="rounded-[var(--sz-radius-xl)] border border-line bg-raised p-[22px]">
          <p className="m-0 mb-4 font-[family-name:var(--sz-font-display)] text-md font-medium text-heading">
            Order summary
          </p>
          <div className="mb-[18px] flex flex-col gap-[15px]">
            {quote.lines.map((line) => (
              <div key={line.productId} className="flex gap-[13px]">
                <SummaryThumb line={line} />
                <div className="min-w-0 flex-1">
                  <p className="m-0 font-[family-name:var(--sz-font-display)] text-control leading-[1.25] text-heading">
                    {line.name}
                  </p>
                  <p className="m-0 mt-1 font-mono text-2xs text-muted">
                    {line.sku}
                    {line.quantity > 1 && ` · ×${line.quantity}`}
                  </p>
                </div>
                <p className="m-0 whitespace-nowrap font-mono text-trust tabular-nums text-body">
                  {line.price}
                </p>
              </div>
            ))}
          </div>
          <div className="border-t border-line-soft pt-4">{summaryRows}</div>
          {placeButton()}
          <p className="m-0 mt-[11px] text-center text-offer text-muted-soft">
            Guest checkout · no account needed
          </p>
        </div>
      </aside>

      <div className="fixed inset-x-0 bottom-0 z-[850] hidden items-center gap-3.5 border-t border-line bg-[rgb(var(--sz-canvas-rgb)/.97)] px-4 pb-[calc(10px+env(safe-area-inset-bottom))] pt-2.5 backdrop-blur-[10px] checkout-stacked:flex">
        <div className="shrink-0">
          <p className="m-0 text-2xs leading-none text-muted">Total</p>
          <p className="m-0 font-mono text-control font-semibold leading-[1.3] tracking-tight text-primary-700">
            {quote.total}
          </p>
        </div>
        {placeButton("flex-1 rounded-[var(--sz-radius-sticky)]")}
      </div>
    </div>
  );
}

function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} role="alert" className="m-0 mt-1.5 flex items-center gap-1.5 text-trust text-error">
      <Icon name="alert" size={13} strokeWidth={2} />
      {children}
    </p>
  );
}

function SummaryThumb({
  line,
  small = false,
}: {
  line: CheckoutQuote["lines"][number];
  small?: boolean;
}) {
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-[var(--sz-radius-control)] bg-[repeating-linear-gradient(135deg,var(--sz-line-soft)_0_9px,var(--sz-surface)_9px_18px)]",
        small
          ? "h-16 w-[52px]"
          : "h-[var(--sz-summary-thumb-h)] w-[var(--sz-summary-thumb-w)]",
      )}
    >
      {line.imageUrl ? (
        <Image src={line.imageUrl} alt="" fill sizes="58px" loading="eager" className="object-cover" />
      ) : (
        <span aria-hidden="true" className="size-5 rotate-45 bg-accent opacity-55" />
      )}
    </span>
  );
}
