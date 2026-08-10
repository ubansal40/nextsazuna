"use client";

import {
  createContext,
  useCallback,
  useContext,
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
      {/* Polite: a toast should not interrupt what a screen reader is saying. */}
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-6 right-6 z-[200] flex flex-col gap-2.5 pointer-events-none"
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
