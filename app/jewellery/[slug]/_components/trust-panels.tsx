"use client";

import { useState } from "react";
import { Icon, useDialog, type IconName } from "@/components/ui";

/**
 * Trust panels and their modal — spec lines 195-207 and 274-290.
 *
 * The SGL panel is deliberately louder than the four tiles: certification is
 * the claim the whole catalog rests on. Every panel opens the same modal.
 *
 * The copy is brand policy, identical on every product, so it lives here rather
 * than in the catalog. If it ever needs to differ per product or be editable,
 * it belongs in a content block.
 */

interface TrustTopic {
  id: string;
  icon: IconName;
  label: string;
  title: string;
  paragraphs: string[];
}

const SGL: TrustTopic = {
  id: "sgl",
  icon: "shield-check",
  label: "Certified Diamond",
  title: "SGL Certified Diamond",
  paragraphs: [
    "Every Sazuna diamond ships with an independent SGL certificate — graded by a third party, never by us.",
    "The carat, colour, clarity and cut we quote are exactly what you receive, laser-inscribed and matched to your invoice.",
  ],
};

const TILES: TrustTopic[] = [
  {
    id: "shipping",
    icon: "truck",
    label: "Free Insured Shipping",
    title: "Free Insured Shipping",
    paragraphs: [
      "Complimentary, fully insured shipping anywhere in Nepal.",
      "Every parcel travels door-to-door under signature and is insured until it reaches your hands.",
    ],
  },
  {
    id: "cod",
    icon: "card",
    label: "Cash on Delivery",
    title: "Cash on Delivery",
    paragraphs: [
      "Pay on delivery anywhere in Nepal.",
      "Inspect the sealed, certified packaging with our courier before you pay.",
    ],
  },
  {
    id: "buyback",
    icon: "exchange",
    label: "Buyback & Exchange",
    title: "Buyback & Exchange",
    paragraphs: [
      "Lifetime buyback and exchange on every piece.",
      "Exchange toward a new design, or sell it back to us at prevailing value.",
    ],
  },
  {
    id: "service",
    icon: "wrench",
    label: "Lifetime Service",
    title: "Lifetime Service",
    paragraphs: [
      "Free cleaning, polishing and re-rhodium for life.",
      "Resizing and repairs are handled by our master karigars for as long as you own the piece.",
    ],
  },
];

export function TrustPanels() {
  const [topic, setTopic] = useState<TrustTopic | null>(null);
  const { ref, onBackdropClick } = useDialog(Boolean(topic), () => setTopic(null));

  return (
    <>
      <button
        type="button"
        onClick={() => setTopic(SGL)}
        className="mt-6 flex w-full cursor-pointer items-center gap-3.5 rounded-[var(--sz-radius-lg)] border border-sgl-border bg-sgl-bg px-[18px] py-4 text-left transition-colors duration-[var(--sz-dur-fast)] hover:border-primary-700"
      >
        <span className="inline-flex size-[42px] shrink-0 items-center justify-center rounded-[11px] bg-primary-800 text-accent">
          <Icon name="shield-check" size={22} strokeWidth={1.5} />
        </span>
        <span className="flex-1">
          <span className="block text-prose font-semibold text-heading">{SGL.label}</span>
          <span className="mt-0.5 block text-trust text-muted">
            Independently graded — exactly as described
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-[5px] text-trust font-semibold text-primary-700">
          Details
          <Icon name="arrow-right" size={14} strokeWidth={1.8} />
        </span>
      </button>

      <div className="mt-2.5 grid grid-cols-4 gap-2.5 pdp-narrow:grid-cols-2">
        {TILES.map((tile) => (
          <button
            key={tile.id}
            type="button"
            onClick={() => setTopic(tile)}
            className="flex min-h-11 cursor-pointer flex-col items-start gap-[9px] rounded-[var(--sz-radius-card)] border border-line bg-raised p-3.5 text-left transition-colors duration-[var(--sz-dur-fast)] hover:border-accent"
          >
            <span className="text-primary-700">
              <Icon name={tile.icon} size={20} strokeWidth={1.5} />
            </span>
            <span className="text-trust font-semibold leading-[1.3] text-body">{tile.label}</span>
          </button>
        ))}
      </div>

      <dialog
        ref={ref}
        onClick={onBackdropClick}
        aria-label={topic?.title}
        className="m-auto w-[calc(100%-40px)] max-w-[440px] rounded-[var(--sz-radius-modal)] bg-canvas p-[26px] text-body shadow-modal backdrop:bg-[var(--sz-scrim)] backdrop:animate-fade open:animate-sheet-up"
      >
        {topic && (
          <>
            <div className="flex items-start justify-between gap-3.5">
              <h2 className="font-[family-name:var(--sz-font-display)] text-modal-title font-medium text-heading">
                {topic.title}
              </h2>
              <button
                type="button"
                onClick={() => setTopic(null)}
                aria-label="Close"
                className="-mr-1.5 -mt-1.5 inline-flex size-[38px] shrink-0 cursor-pointer items-center justify-center text-body transition-colors duration-[var(--sz-dur-fast)] hover:text-primary-700"
              >
                <Icon name="close" size={20} strokeWidth={1.9} />
              </button>
            </div>
            <div className="mt-3">
              {topic.paragraphs.map((paragraph) => (
                <p
                  key={paragraph}
                  className="m-0 mb-2.5 text-sm leading-[1.6] text-muted [text-wrap:pretty]"
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </>
        )}
      </dialog>
    </>
  );
}
