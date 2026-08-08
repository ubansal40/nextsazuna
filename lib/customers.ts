import "server-only";

import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { query, queryOne } from "./db";
import { normalisePhone } from "./order-lookup";

/**
 * Customer records.
 *
 * `customers.phone` is the identity — `NOT NULL UNIQUE` — and it is stored in
 * the bare 10-digit local form. `email` is nullable and deliberately NOT unique,
 * so it can identify a person for support but never for sign-in.
 *
 * There is no self-registration anywhere: a customer row exists because someone
 * placed an order. That is why linking at checkout (below) matters so much — it
 * is the only thing that creates an account.
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
  /** Staff-internal. Must never reach the browser — see publicCustomer. */
  notes: string | null;
  created_at: Date | string;
}

/**
 * `dob` and `anniversary` are read through DATE_FORMAT rather than as DATE.
 *
 * mysql2 hands a bare DATE back as a JS `Date` at local midnight, which shifts a
 * day either way once serialised through a timezone. The reference app hit this
 * and formats in SQL; doing the same is what stops a customer's birthday landing
 * on the wrong day.
 */
const CUSTOMER_COLUMNS = `id, phone, name, email,
        address_line1, address_line2, city, state, postal_code, country,
        DATE_FORMAT(dob, '%Y-%m-%d') AS dob,
        DATE_FORMAT(anniversary, '%Y-%m-%d') AS anniversary,
        ring_size, bangle_size, loyalty_points, notes, created_at`;

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
 * this by accident. `notes` is staff-internal CRM commentary — "haggled hard",
 * "prefers WhatsApp" — and is the specific reason this function exists.
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

export async function findCustomerByPhone(phone: string): Promise<CustomerRow | null> {
  const normalised = normalisePhone(phone);
  if (normalised.length !== 10) return null;

  return queryOne<CustomerRow>(
    `SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE phone = ? LIMIT 1`,
    [normalised],
  );
}

export async function findCustomerById(id: number): Promise<CustomerRow | null> {
  if (!Number.isInteger(id) || id <= 0) return null;

  return queryOne<CustomerRow>(
    `SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE id = ? LIMIT 1`,
    [id],
  );
}

/**
 * Find or create the customer behind an order, on the order's own connection.
 *
 * Called from `createOrder` inside its transaction, which is the fix for the
 * bug this stage opened with: neither this app nor the Express one linked a web
 * order to a customer, so a real buyer got "no account found" at sign-in and,
 * once an account did appear, saw a history missing everything placed before it.
 *
 * Blanks are filled, nothing is overwritten. A customer can edit their own
 * address in the portal, and the checkout form is a delivery address for one
 * order — the order row already holds that. Letting checkout write over the
 * profile would quietly undo an edit the customer made on purpose.
 *
 * Returns null rather than throwing when the phone is unusable: an order must
 * still be placeable by someone whose number we cannot canonicalise.
 */
export async function linkCustomerToOrder(
  connection: PoolConnection,
  customer: { phone: string; name: string; email: string },
): Promise<number | null> {
  const phone = normalisePhone(customer.phone);
  if (phone.length !== 10) return null;

  const name = customer.name.trim().slice(0, 120) || null;
  const email = customer.email.trim().slice(0, 190) || null;

  // NULLIF so an empty string never counts as a value worth keeping, and
  // COALESCE(col, VALUES(col)) so an existing value always wins over this one.
  const [result] = await connection.execute<ResultSetHeader>(
    `INSERT INTO customers (phone, name, email)
          VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
          name  = COALESCE(NULLIF(name, ''), VALUES(name)),
          email = COALESCE(NULLIF(email, ''), VALUES(email)),
          id    = LAST_INSERT_ID(id)`,
    [phone, name, email],
  );

  return result.insertId || null;
}

export interface CustomerOrderRow extends RowDataPacket {
  id: number;
  order_number: string;
  status: string;
  payment_method: string;
  payment_status: string;
  total_amount: string;
  currency: string;
  created_at: Date | string;
  item_count: number;
}

/**
 * A customer's order history.
 *
 * Column allowlist again — the list view has no business carrying the address
 * or the note. Capped rather than paginated, as the reference does: nobody has
 * two hundred orders, and a pager on a page nobody scrolls is furniture.
 */
export async function listCustomerOrders(
  customerId: number,
  hiddenStatuses: readonly string[],
): Promise<CustomerOrderRow[]> {
  const placeholders = hiddenStatuses.map(() => "?").join(", ");

  return query<CustomerOrderRow>(
    `SELECT id, order_number, status, payment_method, payment_status,
            total_amount, currency, created_at,
            (SELECT COALESCE(SUM(quantity), 0) FROM order_items WHERE order_id = orders.id) AS item_count
       FROM orders
      WHERE customer_id = ? AND status NOT IN (${placeholders})
      ORDER BY id DESC
      LIMIT 200`,
    [customerId, ...hiddenStatuses],
  );
}
