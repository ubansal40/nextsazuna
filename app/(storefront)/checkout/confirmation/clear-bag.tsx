"use client";

import { useEffect } from "react";
import { clearCartForOrder } from "@/lib/cart-storage";

/**
 * Empties the browser's bag once the order it became has settled.
 *
 * A gateway returns the customer here, not to the page that placed the order,
 * so this is the only point at which a paid bag can be cleared.
 *
 * Only for the order this browser just placed, though. This page is also the
 * "View your order" link in the confirmation email, and it used to clear on
 * every visit: a customer checking last week's order wiped the bag they were
 * filling today, in every open tab.
 */
export function ClearBagOnMount({ orderNumber }: { orderNumber: string }) {
  useEffect(() => {
    clearCartForOrder(orderNumber);
  }, [orderNumber]);

  return null;
}
