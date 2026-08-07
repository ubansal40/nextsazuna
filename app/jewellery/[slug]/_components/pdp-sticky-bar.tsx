"use client";

import { useEffect, useState } from "react";
import { addToBag, type AddToBagDetail } from "@/lib/cart-events";
import { Icon, useToast } from "@/components/ui";

export interface PdpStickyBarProps {
  product: AddToBagDetail;
  inStock: boolean;
  whatsappHref?: string | null;
}

/**
 * Mobile buy bar — spec lines 266-272.
 *
 * Pinned to the bottom below 768px, and stood down once the footer comes into
 * view so it never covers the site's own links. The spec computes that from
 * scroll offsets on every frame; an IntersectionObserver on the footer is the
 * same rule without the rAF loop.
 *
 * The spec also hides the bar while the mini-cart is open. That is unnecessary
 * here because the mini-cart is a modal <dialog> and renders in the top layer,
 * above any z-index this bar could claim.
 */
export function PdpStickyBar({ product, inStock, whatsappHref }: PdpStickyBarProps) {
  const [footerVisible, setFooterVisible] = useState(false);

  useEffect(() => {
    const footer = document.querySelector("footer");
    if (!footer) return;
    const observer = new IntersectionObserver(
      ([entry]) => setFooterVisible(entry.isIntersecting),
      // Matches the spec's 40px lead-in before the footer counts as on screen.
      { rootMargin: "0px 0px -40px 0px" },
    );
    observer.observe(footer);
    return () => observer.disconnect();
  }, []);

  const { toast } = useToast();

  if (footerVisible) return null;

  function primary() {
    if (inStock) {
      addToBag(product);
      toast("success", "Added to your bag");
      return;
    }
    const target = document.querySelector("[data-pdp-actions]");
    if (!target) return;
    window.scrollTo({
      top: target.getBoundingClientRect().top + window.scrollY - 90,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[850] flex items-center gap-2.5 border-t border-line bg-[rgb(var(--sz-canvas-rgb)/.97)] px-4 pb-[calc(10px+env(safe-area-inset-bottom))] pt-2.5 backdrop-blur-[10px] min-[769px]:hidden">
      {whatsappHref && (
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="WhatsApp Inquiry"
          className="inline-flex size-[var(--sz-control-h-lg)] shrink-0 items-center justify-center rounded-[var(--sz-radius-sticky)] border border-primary-200 bg-raised text-primary-700 no-underline transition-colors duration-[var(--sz-dur-fast)] hover:border-primary-700 hover:bg-primary-50 hover:no-underline"
        >
          <Icon name="whatsapp-solid" size={20} />
        </a>
      )}
      <button
        type="button"
        onClick={primary}
        className="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-[var(--sz-radius-sticky)] bg-primary-700 text-control font-semibold text-white min-h-[var(--sz-control-h-lg)] transition-colors duration-[var(--sz-dur-fast)] hover:bg-primary-800"
      >
        {inStock ? "Add to Bag" : "Notify Me"}
      </button>
    </div>
  );
}
