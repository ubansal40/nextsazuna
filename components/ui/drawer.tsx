"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import { useDialog } from "./use-dialog";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Pinned to the bottom — cart subtotal, primary action. */
  footer?: ReactNode;
  side?: "right" | "left";
  className?: string;
}

/**
 * Drawer — spec §Component · Overlays & navigation. Used for the mini-cart and
 * mobile navigation. Same <dialog> rationale as Modal.
 */
export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  side = "right",
  className,
}: DrawerProps) {
  const { ref, onBackdropClick } = useDialog(open, onClose);

  return (
    <dialog
      ref={ref}
      onClick={onBackdropClick}
      aria-labelledby="sz-drawer-title"
      className={cn(
        "p-0 m-0 h-dvh max-h-dvh w-full max-w-[420px] bg-canvas text-body shadow-lg",
        side === "right" ? "ml-auto mr-0" : "mr-auto ml-0",
        "backdrop:bg-[var(--sz-overlay)] backdrop:animate-fade",
        "open:animate-slide-right",
        className,
      )}
    >
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between gap-4 px-6 py-5 border-b border-line">
          <h2 id="sz-drawer-title" className="text-lg">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex text-muted hover:text-heading cursor-pointer p-1 transition-colors duration-[var(--sz-dur-fast)]"
          >
            <Icon name="close" size={20} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && <footer className="border-t border-line px-6 py-5 bg-surface">{footer}</footer>}
      </div>
    </dialog>
  );
}
