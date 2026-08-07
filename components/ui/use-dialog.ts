"use client";

import { useEffect, useRef } from "react";

/**
 * Drives a native <dialog> from React state.
 *
 * Two things this gets right that a bare `onClose` prop does not:
 *
 *  1. The dialog's `close` event does not bubble, and React's synthetic
 *     `onClose` does not reliably fire for it. Without a native listener, a
 *     browser-initiated close (Escape, or the backdrop) closes the element but
 *     leaves React thinking it is still open — after which the dialog can never
 *     be reopened, because the state never changed. This was a real bug, caught
 *     in review, not a hypothetical.
 *  2. `onClose` is usually an inline arrow, so it is a new function every
 *     render. Holding it in a ref keeps the listener subscribed once instead of
 *     resubscribing on every render.
 */
export function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Keep the element in sync with React state.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Report browser-initiated closes back to React.
  //
  // Both events are wired deliberately. `close` is the general signal, but some
  // engines do not emit it for a programmatic close, and relying on it alone
  // leaves React believing the dialog is still open. `cancel` fires on Escape
  // specifically, which is the path a user actually takes, so handling it makes
  // Escape correct either way. Both funnel into the same idempotent onClose, so
  // a double fire is harmless.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleClose = () => onCloseRef.current();
    dialog.addEventListener("close", handleClose);
    dialog.addEventListener("cancel", handleClose);
    return () => {
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("cancel", handleClose);
    };
  }, []);

  /** Close when the click landed on the backdrop rather than the panel. */
  const onBackdropClick = (event: React.MouseEvent<HTMLDialogElement>) => {
    if (event.target === ref.current) onCloseRef.current();
  };

  return { ref, onBackdropClick };
}
