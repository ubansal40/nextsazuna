"use client";

import { Icon, useToast } from "@/components/ui";

/**
 * The copy affordance beside the order number — Sazuna Order Status.dc.html.
 *
 * Small, but it is the number someone is asked for on every WhatsApp thread
 * about their order, and copying it off a receipt by hand on a phone is where
 * people mistype it.
 */
export function CopyOrderNumber({ orderNumber }: { orderNumber: string }) {
  const { toast } = useToast();

  async function copy() {
    try {
      await navigator.clipboard.writeText(orderNumber);
      toast("success", "Order number copied");
    } catch {
      // Clipboard access is refused on insecure origins and by some browsers.
      // The number is on screen either way, so this is not worth an error.
      toast("info", "Press and hold the number to copy it");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy order number ${orderNumber}`}
      className="inline-flex size-10 flex-none cursor-pointer items-center justify-center rounded-[var(--sz-radius-btn-lg)] border border-line bg-canvas text-primary-700 transition-colors duration-[var(--sz-dur-fast)] hover:border-primary-700"
    >
      <Icon name="copy" size={16} strokeWidth={1.7} />
    </button>
  );
}
