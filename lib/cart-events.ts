/**
 * The PDP → header hand-off for "Add to Bag".
 *
 * Both specs describe this seam: the PDP dispatches, the shell listens and
 * opens the mini-cart. A custom event rather than shared state because the
 * header is mounted by the root layout and the PDP is a page — they have no
 * common React ancestor short of a provider the cart phase will introduce.
 *
 * The bag this fills lives in the header's own state, so it lasts for the
 * session and no longer. Persisting it is the cart phase's job.
 */

export const ADD_TO_BAG_EVENT = "sazuna:add-to-bag";

export interface AddToBagDetail {
  /** Product id, as a string — the cart keys lines by it. */
  id: string;
  name: string;
  /** Formatted for display. */
  price: string;
  /** The same amount in paisa, as an exact integer, for totalling. */
  priceMinor: number;
  href: string;
  imageUrl?: string | null;
}

export function addToBag(detail: AddToBagDetail): void {
  window.dispatchEvent(new CustomEvent<AddToBagDetail>(ADD_TO_BAG_EVENT, { detail }));
}
