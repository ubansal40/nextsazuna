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

/**
 * One line per product, clamped, in first-seen order.
 *
 * Nothing in this module writes a duplicate, but storage is the customer's to
 * edit, and older builds or a second tab racing a write can leave one behind.
 * Unmerged, `[{5,10},{5,10}]` priced as two lines of ten — twenty units past a
 * ten-per-line limit — and the bag drew two rows sharing one React key, so the
 * stepper and remove acted on both. The server merges with this same function
 * before pricing, so a hand-built request gets no further.
 */
export function mergeEntries(entries: readonly CartEntry[]): CartEntry[] {
  const merged = new Map<number, number>();
  for (const { productId, quantity } of entries) {
    merged.set(productId, Math.min((merged.get(productId) ?? 0) + quantity, MAX_QUANTITY));
  }
  return [...merged].map(([productId, quantity]) => ({ productId, quantity }));
}

export function readCart(): CartEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CART_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return mergeEntries(
      parsed.filter(isEntry).filter((entry) => entry.productId > 0 && entry.quantity > 0),
    );
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

/**
 * Choices made in the bag that checkout must honour.
 *
 * Both used to be lost or stale on the way there. The promo code lived only in
 * the bag's React state, so a customer shown "SAVE10 −रु 2,500" in the bag
 * reached checkout at the full price with nothing to say the code had gone.
 * Gift wrap was carried, but it outlived the bag it was chosen for: ticked in a
 * bag abandoned weeks ago, it was quietly charged on the next order.
 *
 * So they are stored beside the bag, and a bag started from empty starts
 * without them.
 */
export const GIFT_WRAP_KEY = "sazuna:gift-wrap";
export const PROMO_KEY = "sazuna:promo";

/**
 * The order this browser just placed. The confirmation page empties the bag
 * only when it is showing THIS order — it is also where the receipt email
 * links, and opening an old receipt must not wipe the bag being filled now.
 */
const PLACED_ORDER_KEY = "sazuna:placed-order";

export function readBagOptions(): { giftWrap: boolean; code: string | null } {
  try {
    const code = window.localStorage.getItem(PROMO_KEY)?.trim();
    return {
      giftWrap: window.localStorage.getItem(GIFT_WRAP_KEY) === "1",
      code: code ? code.slice(0, 50) : null,
    };
  } catch {
    return { giftWrap: false, code: null };
  }
}

export function writeGiftWrap(on: boolean): void {
  try {
    window.localStorage.setItem(GIFT_WRAP_KEY, on ? "1" : "0");
  } catch {
    // Storage blocked — the choice still holds for this page.
  }
}

export function writePromo(code: string | null): void {
  try {
    if (code) window.localStorage.setItem(PROMO_KEY, code);
    else window.localStorage.removeItem(PROMO_KEY);
  } catch {
    // Storage blocked — the code still applies on this page.
  }
}

function clearBagOptions(): void {
  try {
    window.localStorage.removeItem(GIFT_WRAP_KEY);
    window.localStorage.removeItem(PROMO_KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

export function rememberPlacedOrder(orderNumber: string): void {
  try {
    window.localStorage.setItem(PLACED_ORDER_KEY, orderNumber);
  } catch {
    // Without the marker the bag is simply kept; nothing is lost.
  }
}

/**
 * Empty the bag, its options and the marker — but only for the order this
 * browser placed. Returns whether it did.
 */
export function clearCartForOrder(orderNumber: string): boolean {
  try {
    if (window.localStorage.getItem(PLACED_ORDER_KEY) !== orderNumber) return false;
    window.localStorage.removeItem(PLACED_ORDER_KEY);
  } catch {
    return false;
  }
  clearCart();
  return true;
}

/** Adds one, or bumps an existing line. Returns the new contents. */
export function addToCart(productId: number, quantity = 1): CartEntry[] {
  const entries = readCart();
  // A new bag does not inherit gift wrap or a promo code from an old one.
  if (!entries.length) clearBagOptions();
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
  clearBagOptions();
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
