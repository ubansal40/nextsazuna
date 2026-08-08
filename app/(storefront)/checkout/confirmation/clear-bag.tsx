"use client";

import { useEffect } from "react";
import { clearCart } from "@/lib/cart-storage";

/**
 * Empties the browser's bag once an order has settled.
 *
 * A gateway returns the customer here, not to the page that placed the order,
 * so this is the only point at which a paid bag can be cleared.
 */
export function ClearBagOnMount() {
  useEffect(() => {
    clearCart();
    try {
      window.localStorage.removeItem("sazuna:gift-wrap");
    } catch {
      // Nothing to do; the bag itself is already cleared.
    }
  }, []);

  return null;
}
