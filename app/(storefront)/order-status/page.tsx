import type { Metadata } from "next";
import { ContentKicker } from "@/components/content/policy-page";
import { LookupForm } from "./_components/lookup-form";

/**
 * Track your order — Sazuna Order Status.dc.html §guest lookup.
 *
 * A new URL. The Express storefront tracked orders at /order-success.html#track,
 * a second view bolted onto the receipt page, which meant the tracker inherited
 * that page's `Disallow` in robots.txt. This is its own route, and is indexable.
 *
 * The lookup is a fetch to /api/orders/lookup, so this page reads nothing
 * itself — the form and its copy are all that render on the server.
 */

export const metadata: Metadata = {
  title: "Track your order",
  description:
    "Track any Sazuna order with your order number and the phone or email used at checkout — no account needed.",
  alternates: { canonical: "/order-status" },
};

export default function OrderStatusPage() {
  return (
    <div className="mx-auto max-w-[var(--sz-container)] px-10 pb-24 policy-narrow:px-[18px]">
      <header className="mx-auto max-w-[560px] pt-[34px] text-center">
        <div className="flex justify-center">
          <ContentKicker>Track your order</ContentKicker>
        </div>
        <h1 className="m-0 text-content-h1 font-normal tracking-tight text-heading policy-stacked:text-content-h1-sm">
          Where&rsquo;s my order?
        </h1>
        <p className="m-0 mt-3 text-control leading-relaxed text-muted">
          Enter your order number and the phone or email used at checkout — no account needed.
        </p>
      </header>

      <LookupForm />
    </div>
  );
}
