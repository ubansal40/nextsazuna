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
  /**
   * `right`/`left` are full-height side panels (mini-cart, mobile nav).
   * `bottom` is the mobile sheet: rounded top, capped height, slides up.
   */
  side?: "right" | "left" | "bottom";
  className?: string;
}

/**
 * Drawer — spec §Overlays & navigation, and the listing page's filter and sort
 * sheets. One <dialog> implementation serves all three so focus trapping,
 * Escape and backdrop behaviour cannot drift between them.
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
  const isSheet = side === "bottom";

  return (
    <dialog
      ref={ref}
      onClick={onBackdropClick}
      aria-labelledby="sz-drawer-title"
      className={cn(
        "bg-canvas p-0 text-body shadow-lg",
        "backdrop:bg-[rgb(var(--sz-heading-rgb)/.44)] backdrop:animate-fade",
        isSheet
          ? [
              // Pinned to the bottom of the viewport, full width, capped so the
              // page behind stays partly visible.
              "mx-auto mb-0 mt-auto w-full max-w-none",
              "max-h-[84vh] rounded-t-[18px]",
              "open:animate-sheet-up",
            ]
          : [
              "m-0 h-dvh max-h-dvh w-full max-w-[420px]",
              side === "right" ? "ml-auto mr-0 open:animate-slide-right" : "mr-auto ml-0 open:animate-slide-left",
            ],
        className,
      )}
    >
      <div className={cn("flex flex-col", isSheet ? "max-h-[84vh]" : "h-full")}>
        <header className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-3.5">
          <h2
            id="sz-drawer-title"
            className="font-[family-name:var(--sz-font-display)] text-[19px] font-medium text-heading"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title.toLowerCase()}`}
            className="-mr-2.5 inline-flex size-11 cursor-pointer items-center justify-center text-body transition-colors duration-[var(--sz-dur-fast)] hover:text-heading"
          >
            <Icon name="close" size={20} strokeWidth={1.9} />
          </button>
        </header>

        <div
          className={cn(
            "flex-1 overflow-y-auto overscroll-contain",
            isSheet ? "px-5 pb-2.5 pt-1" : "px-6 py-5",
          )}
        >
          {children}
        </div>

        {footer && (
          <footer
            className={cn(
              "border-t border-line bg-surface",
              isSheet ? "px-5 py-4 pb-[calc(16px+env(safe-area-inset-bottom))]" : "px-6 py-5",
            )}
          >
            {footer}
          </footer>
        )}
      </div>
    </dialog>
  );
}
