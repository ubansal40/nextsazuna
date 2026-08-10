"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import { useDialog } from "./use-dialog";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Small mono caps line above the title, e.g. "Certification". */
  eyebrow?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/**
 * Modal — spec §Component · Overlays & navigation.
 *
 * Built on native <dialog>, so focus trapping, Escape-to-close, background
 * inerting and the top-layer stacking come from the platform instead of being
 * reimplemented (and subtly gotten wrong) in JS.
 */
export function Modal({ open, onClose, title, eyebrow, children, footer, className }: ModalProps) {
  const { ref, onBackdropClick } = useDialog(open, onClose);
  // Per instance: a literal id breaks the moment two Modals are mounted at once,
  // because aria-labelledby then resolves to whichever title is first in the DOM.
  const titleId = useId();

  return (
    <dialog
      ref={ref}
      onClick={onBackdropClick}
      aria-labelledby={titleId}
      className={cn(
        "m-auto w-full max-w-[460px] p-0 bg-canvas text-body",
        "rounded-[var(--sz-radius-xl)] shadow-lg overflow-hidden",
        "backdrop:bg-[var(--sz-overlay)] backdrop:animate-fade",
        "open:animate-scale-in",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4 px-[26px] pt-6">
        {eyebrow && (
          <span className="inline-flex items-center gap-[9px]">
            <span className="inline-flex items-center justify-center size-[34px] rounded-[var(--sz-radius-pill)] bg-primary-800 text-accent">
              <Icon name="shield" size={18} />
            </span>
            <span className="font-mono text-2xs tracking-[var(--sz-tracking-caps)] uppercase text-primary-700">
              {eyebrow}
            </span>
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="ml-auto inline-flex text-muted hover:text-heading cursor-pointer p-1 transition-colors duration-[var(--sz-dur-fast)]"
        >
          <Icon name="close" size={20} />
        </button>
      </div>

      <div className="px-[26px] pt-3.5 pb-[26px]">
        <h2 id={titleId} className="text-lg mb-2.5">
          {title}
        </h2>
        <div className="text-sm leading-[var(--sz-leading-relaxed)] text-body">{children}</div>
        {footer && <div className="mt-4">{footer}</div>}
      </div>
    </dialog>
  );
}
