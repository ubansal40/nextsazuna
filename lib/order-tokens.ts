import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

/**
 * Order receipt lookup tokens.
 *
 * Ported from the Express app's `server/utils/order-tokens.js`, which added
 * them to close an IDOR: the order number alone was enough to read a
 * customer's name, phone, email and shipping address, and the numbers were
 * sequential, so the whole table could be walked with a loop.
 *
 * Our order numbers are random rather than sequential, which makes walking
 * them harder — but "harder to guess" is not an access control, and the same
 * receipt route is reachable by anyone. So the guard comes across too.
 *
 * Stateless by design: the token is derived from the order number, so it needs
 * no column, works for orders that already exist, and can be regenerated for a
 * resent receipt. The cost is that rotating the secret invalidates outstanding
 * links — acceptable, since the customer always has the confirmation email.
 */

const TOKEN_LENGTH = 24;

export function orderLookupToken(orderNumber: string): string {
  const normalised = orderNumber.trim();
  if (!normalised) throw new Error("orderLookupToken: an order number is required");

  return createHmac("sha256", env().SAZUNA_TOKEN_SECRET)
    .update(`order:${normalised}`)
    .digest("hex")
    .slice(0, TOKEN_LENGTH);
}

/** Constant-time, so the token cannot be recovered a character at a time. */
export function verifyOrderLookupToken(orderNumber: string, provided: string | undefined): boolean {
  if (!provided) return false;

  const expected = orderLookupToken(orderNumber);
  const supplied = provided.trim().toLowerCase();
  if (supplied.length !== expected.length) return false;

  try {
    return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(supplied, "utf8"));
  } catch {
    return false;
  }
}
