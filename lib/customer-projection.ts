import type { RowDataPacket } from "mysql2";

/**
 * The customer row and its buyer-safe projection.
 *
 * Split from lib/customers.ts, which is `server-only`, for the same reason
 * lib/order-lookup.ts is split from lib/orders.ts: scripts/check-auth.mts has
 * to import this directly to assert that the staff note cannot leak, and a
 * `server-only` module cannot be loaded outside Next.
 */

export interface CustomerRow extends RowDataPacket {
  id: number;
  phone: string;
  name: string | null;
  email: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  dob: string | null;
  anniversary: string | null;
  ring_size: string | null;
  bangle_size: string | null;
  loyalty_points: number;
  /** Staff-internal CRM commentary. Must never reach the browser. */
  notes: string | null;
  created_at: Date | string;
}

/** What the browser may see of a customer. */
export interface PublicCustomer {
  id: number;
  phone: string;
  name: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  dob: string;
  anniversary: string;
  ringSize: string;
  bangleSize: string;
  loyaltyPoints: number;
}

/**
 * The buyer-safe projection.
 *
 * An allowlist rather than a delete-list, like `toBuyerSafeView` in
 * lib/order-lookup.ts: a column added to `customers` later cannot leak through
 * this by accident. `notes` is where staff write things like "haggled hard" or
 * "prefers WhatsApp", and keeping it out is the specific reason this exists.
 */
export function publicCustomer(row: CustomerRow): PublicCustomer {
  const str = (value: unknown) => (typeof value === "string" ? value : "") || "";

  return {
    id: Number(row.id),
    phone: str(row.phone),
    name: str(row.name),
    email: str(row.email),
    addressLine1: str(row.address_line1),
    addressLine2: str(row.address_line2),
    city: str(row.city),
    state: str(row.state),
    postalCode: str(row.postal_code),
    country: str(row.country),
    dob: str(row.dob),
    anniversary: str(row.anniversary),
    ringSize: str(row.ring_size),
    bangleSize: str(row.bangle_size),
    loyaltyPoints: Number(row.loyalty_points) || 0,
  };
}
