"use client";

import { addToBag, type AddToBagDetail } from "@/lib/cart-events";
import { Icon, useToast } from "@/components/ui";

export interface PdpActionsProps {
  product: AddToBagDetail;
  whatsappHref?: string | null;
}

export const bigButtonClass =
  "flex w-full cursor-pointer items-center justify-center gap-[9px] rounded-md text-control font-semibold min-h-[var(--sz-control-h-lg)]";

export const whatsappButtonClass =
  "border border-primary-200 bg-raised text-primary-700 no-underline transition-colors duration-[var(--sz-dur-fast)] hover:border-primary-700 hover:bg-primary-50 hover:text-primary-700 hover:no-underline";

/**
 * Buy-area actions — spec lines 158-193.
 *
 * Add to Bag, the WhatsApp enquiry and Share. The bag hand-off is a custom
 * event the shell header listens for; see lib/cart-events.
 */
export function PdpActions({ product, whatsappHref }: PdpActionsProps) {
  const { toast } = useToast();

  return (
    <>
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => {
            addToBag(product);
            toast("success", "Added to your bag");
          }}
          className={`${bigButtonClass} bg-primary-700 text-white transition-colors duration-[var(--sz-dur-fast)] hover:bg-primary-800`}
        >
          <Icon name="bag" size={18} />
          Add to Bag
        </button>

        {whatsappHref && (
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className={`${bigButtonClass} ${whatsappButtonClass}`}
          >
            <Icon name="whatsapp-solid" size={18} />
            WhatsApp Inquiry
          </a>
        )}
      </div>

      <ShareButton title={product.name} />
    </>
  );
}

/**
 * Share — the native sheet on a phone, the clipboard everywhere else.
 *
 * Separate from PdpActions because an out-of-stock product shows it under the
 * waiting-list form, where there is no Add to Bag to sit beneath.
 */
export function ShareButton({ title }: { title: string }) {
  const { toast } = useToast();

  async function share() {
    const url = window.location.href;
    // The native sheet is the right affordance on a phone; everywhere else,
    // copying the link is more useful than a share target picker.
    if (navigator.share && window.matchMedia("(max-width: 768px)").matches) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // Dismissed, or the share failed — fall through to copying.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("success", "Link copied to clipboard");
    } catch {
      toast("error", "Could not copy the link");
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      className="mt-3.5 inline-flex cursor-pointer items-center gap-2 px-0.5 py-2 text-control-sm font-semibold text-muted transition-colors duration-[var(--sz-dur-fast)] hover:text-primary-700"
    >
      <Icon name="share" size={16} />
      Share this piece
    </button>
  );
}
