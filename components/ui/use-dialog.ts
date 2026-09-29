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
 *
 * `onClose` fires once per close the user asks for, and never for a close the
 * owner made itself by setting `open` to false.
 */
export function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  // What React last asked for. A `close` event arriving while this is false is
  // the echo of our own `dialog.close()`, not news to report back.
  const openRef = useRef(open);
  // Whether the press that ended in a click started on the backdrop.
  const pressedBackdrop = useRef(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Keep the element in sync with React state.
  useEffect(() => {
    const dialog = ref.current;
    // Before close(), so the `close` it queues is recognised as ours.
    openRef.current = open;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Report browser-initiated closes back to React.
  //
  // Both events are wired deliberately. `cancel` fires on Escape and is the one
  // that reaches an owner who prevents it to ask first — the coupon drawer
  // keeps half-typed edits open that way, and still has to hear the key. `close`
  // is the general signal for every other way the platform shuts a dialog.
  //
  // They used to call onClose side by side, so Escape reported twice — `cancel`,
  // then the `close` it causes — as did every close the owner made itself. Now
  // an Escape that goes ahead marks its own `close` as already reported, and a
  // `close` React asked for is not reported at all.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    let escaped = false;
    const handleCancel = (event: Event) => {
      // React's own `onCancel` runs first (it listens from the moment the
      // element exists), so an owner's preventDefault is already visible here.
      escaped = !event.defaultPrevented;
      onCloseRef.current();
    };
    const handleClose = () => {
      if (escaped) {
        escaped = false;
        return;
      }
      if (openRef.current) onCloseRef.current();
    };
    const handlePointerDown = (event: PointerEvent) => {
      pressedBackdrop.current = event.target === dialog;
    };
    dialog.addEventListener("cancel", handleCancel);
    dialog.addEventListener("close", handleClose);
    dialog.addEventListener("pointerdown", handlePointerDown);
    return () => {
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  /**
   * Close when the press and the release both landed on the backdrop.
   *
   * The click alone cannot tell. A drag that starts in a field — selecting its
   * text — and is let go over the backdrop fires its click on the nearest
   * common ancestor, which is the <dialog> itself, and so looked exactly like a
   * backdrop tap: the form closed under the pointer, edits and all.
   */
  const onBackdropClick = (event: React.MouseEvent<HTMLDialogElement>) => {
    if (event.target === ref.current && pressedBackdrop.current) onCloseRef.current();
  };

  return { ref, onBackdropClick };
}
