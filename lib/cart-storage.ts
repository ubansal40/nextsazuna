/**
 * The bag, as the browser holds it.
 *
 * Only product ids and quantities are stored. Prices, names and availability
 * are resolved on the server on every read — see `app/cart/_actions.ts`. That
 * split is the whole point: anything kept in localStorage is under the
 * customer's control, so a price that came from there could be edited, and a
 * cart total is not something to take on trust from the client.
 *
 * localStorage rather than a server cart because there is no session yet and a
 * bag that survives a reload is most of the value. The checkout phase re-prices
 * server-side when it creates the order, so nothing downstream depends on this.
 */

export const CART_KEY = "sazuna:bag";

/** Fired on every mutation so the header and the cart page stay in step. */
export const CART_CHANGED_EVENT = "sazuna:bag-changed";

export interface CartEntry {
  productId: number;
  quantity: number;
}

/** One line may not exceed this. Mirrors the server-side clamp. */
export const MAX_QUANTITY = 10;

function isEntry(value: unknown): value is CartEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return Number.isInteger(entry.productId) && Number.isInteger(entry.quantity);
}

export function readCart(): CartEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CART_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isEntry)
      .filter((entry) => entry.productId > 0 && entry.quantity > 0)
      .map((entry) => ({ ...entry, quantity: Math.min(entry.quantity, MAX_QUANTITY) }));
  } catch {
    // Private browsing, a full quota, or hand-edited junk. An unreadable bag is
    // an empty bag, not a crash on every page in the shell.
    return [];
  }
}

function write(entries: CartEntry[]): void {
  try {
    window.localStorage.setItem(CART_KEY, JSON.stringify(entries));
  } catch {
    // Nothing useful to do — the in-memory state still updates for this page.
  }
  window.dispatchEvent(new CustomEvent(CART_CHANGED_EVENT));
}

/** Adds one, or bumps an existing line. Returns the new contents. */
export function addToCart(productId: number, quantity = 1): CartEntry[] {
  const entries = readCart();
  const existing = entries.find((entry) => entry.productId === productId);
  const next = existing
    ? entries.map((entry) =>
        entry.productId === productId
          ? { ...entry, quantity: Math.min(entry.quantity + quantity, MAX_QUANTITY) }
          : entry,
      )
    : [...entries, { productId, quantity: Math.min(quantity, MAX_QUANTITY) }];
  write(next);
  return next;
}

export function setQuantity(productId: number, quantity: number): CartEntry[] {
  const next =
    quantity < 1
      ? readCart().filter((entry) => entry.productId !== productId)
      : readCart().map((entry) =>
          entry.productId === productId
            ? { ...entry, quantity: Math.min(quantity, MAX_QUANTITY) }
            : entry,
        );
  write(next);
  return next;
}

export function removeFromCart(productId: number): CartEntry[] {
  const next = readCart().filter((entry) => entry.productId !== productId);
  write(next);
  return next;
}

/** Restores a removed line at its original position, for the undo snackbar. */
export function insertAt(entry: CartEntry, index: number): CartEntry[] {
  const entries = readCart().filter((e) => e.productId !== entry.productId);
  entries.splice(Math.min(Math.max(index, 0), entries.length), 0, entry);
  write(entries);
  return entries;
}

export function clearCart(): void {
  write([]);
}

/** Subscribe to bag changes, including those made in another tab. */
export function onCartChanged(handler: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === CART_KEY) handler();
  };
  window.addEventListener(CART_CHANGED_EVENT, handler);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CART_CHANGED_EVENT, handler);
    window.removeEventListener("storage", onStorage);
  };
}
