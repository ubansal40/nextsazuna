"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icon";

export type ToastTone = "success" | "error" | "info";

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastContextValue {
  toast: (tone: ToastTone, message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Access the toast dispatcher. Must be inside a <ToastProvider>. */
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within a <ToastProvider>");
  return context;
}

const TONE: Record<ToastTone, { icon: IconName; className: string }> = {
  // `-ink`, not `-success`: the plain hue on its own soft fill is 4.37:1, under
  // the 4.5:1 this 14px copy needs. Same reason as the Badge stock tones.
  success: { icon: "check", className: "bg-success-soft text-success-ink border-success/25" },
  error: { icon: "alert", className: "bg-error-soft text-error border-error/25" },
  info: { icon: "info", className: "bg-info-soft text-info border-info/25" },
};

export function ToastProvider({
  children,
  duration = 4000,
}: {
  children: ReactNode;
  duration?: number;
}) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const region = useRef<HTMLDivElement>(null);

  /**
   * Draw the stack in the top layer.
   *
   * A modal <dialog> renders in the top layer, above every z-index on the page,
   * so a toast raised while one was open landed underneath it — "Added to your
   * bag" opens the mini-cart in the same click, and was never seen — and on a
   * phone it sat under the PDP's sticky bar as well. As a manual popover the
   * stack is in the top layer too.
   *
   * Shown once and left open: between toasts it is empty and lets the pointer
   * through, and staying rendered keeps the live region in the accessibility
   * tree before a message arrives, which is what gets it announced. Top-layer
   * order is the order things were shown in, so while a modal is open a new
   * toast re-shows the stack to lift it above that modal. This runs after the
   * dialogs' own effects — they are all descendants of this provider — so a
   * modal opened by the same click is already there to be lifted above.
   *
   * An engine without popovers keeps the plain fixed box it always had.
   */
  useEffect(() => {
    const node = region.current;
    if (!node || typeof node.showPopover !== "function") return;
    if (!node.matches(":popover-open")) node.showPopover();
    else if (toasts.length > 0 && document.querySelector("dialog:modal")) {
      node.hidePopover();
      node.showPopover();
    }
  }, [toasts]);

  const toast = useCallback(
    (tone: ToastTone, message: string) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, tone, message }]);
      setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== id));
      }, duration);
    },
    [duration],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Polite: a toast should not interrupt what a screen reader is saying.
          `inset-auto m-0 border-0 p-0 bg-transparent overflow-visible` undo the
          UA's popover box (centred, bordered, padded, opaque). */}
      <div
        ref={region}
        popover="manual"
        role="status"
        aria-live="polite"
        className="fixed inset-auto bottom-6 right-6 z-[200] m-0 flex flex-col gap-2.5 overflow-visible border-0 bg-transparent p-0 pointer-events-none"
      >
        {toasts.map(({ id, tone, message }) => (
          <div
            key={id}
            className={cn(
              "pointer-events-auto flex items-center gap-2.5 min-w-[260px]",
              "border rounded-[var(--sz-radius-md)] shadow-md px-4 py-3 text-sm",
              "animate-toast-in",
              TONE[tone].className,
            )}
          >
            <Icon name={TONE[tone].icon} size={18} />
            {message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
