import "server-only";

import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { query, queryOne, transaction } from "../db";
import { recordAdminAction } from "./audit";
import { escapeLike } from "./catalog";
import { normaliseColour, type StatusColour } from "./order-status-colours";
import type { AdminContext } from "./rbac";

/**
 * The customer CRM — the list, one profile, and the only edit it allows.
 *
 * `customers` is phone-keyed: the row is created by checkout or by the order
 * desk from a phone number, and that number is also the customer's OTP login
 * handle. So `phone` is identity here, not a contact field — see
 * `EDITABLE_FIELDS` below, which deliberately has no entry for it.
 *
 * Money stays a string end-to-end (ADR 0003). Lifetime spend is a SUM of
 * `orders.total_amount`, a DECIMAL, which the driver returns as a string with
 * `decimalNumbers: false`; nothing here parses it, and `formatPrice` turns it
 * into text at the edge.
 *
 * Orders are soft-deleted, so `o.deleted_at IS NULL` is baked into every join
 * rather than left to callers to remember.
 *
 * The database sits ~320ms away, so the list answers a whole page in two round
 * trips (the page with its aggregates, and the count) and the profile in three
 * (customer, orders, ledger) — never anything per row.
 */

const PAGE_SIZE = 25;

/**
 * Statuses that are not a sale, and so do not count toward lifetime spend.
 *
 * A denylist, not the reference's `IN ('billed','completed')` allowlist, and
 * that difference matters now that statuses are admin-configurable (migration
 * 0013): an allowlist would silently value every newly-added workflow status at
 * zero, so adding "Awaiting stone setting" would wipe spend off the customers
 * sitting in it. These three are the only statuses that mean *no money changed
 * hands* — an abandoned gateway hop, a failed payment, a cancellation — and all
 * three are `is_system = 1`, so they cannot be deleted or re-keyed out from
 * under this list.
 *
 * The Orders column is deliberately a count of ALL live orders, including
 * these, because "how many orders are on file" and "how much have they spent"
 * are different questions; the profile's order history shows each one's status.
 */
export const NON_SPEND_STATUSES = ["pending_payment", "payment_failed", "cancelled"] as const;

/** Timestamps cross to the client as ISO strings; the client formats to the
 *  viewer's locale. A `Date` would survive the boundary but arrive as a
 *  different type on either side of a Server Action. */
const iso = (value: Date | string | null) =>
  value ? (value instanceof Date ? value : new Date(value)).toISOString() : null;

/** The sortable columns, mapped rather than interpolated from the request. */
const SORTS: Record<string, string> = {
  recent: "c.updated_at DESC, c.id DESC",
  name_asc: "(c.name IS NULL OR c.name = '') ASC, c.name ASC, c.id DESC",
  name_desc: "(c.name IS NULL OR c.name = '') ASC, c.name DESC, c.id DESC",
  orders_desc: "order_count DESC, c.id DESC",
  orders_asc: "order_count ASC, c.id DESC",
  spend_desc: "lifetime_spend DESC, c.id DESC",
  spend_asc: "lifetime_spend ASC, c.id DESC",
  joined_desc: "c.created_at DESC, c.id DESC",
  joined_asc: "c.created_at ASC, c.id ASC",
};

export interface AdminCustomerFilters {
  search?: string;
  sort?: string;
  page?: number;
}

export interface AdminCustomerRow {
  id: number;
  name: string | null;
  phone: string;
  email: string | null;
  /** Every live order on file, whatever its status. */
  orderCount: number;
  /** DECIMAL string. Never parsed on the way to the screen. */
  lifetimeSpend: string;
  loyaltyPoints: number;
  joinedAt: string;
}

export interface AdminCustomerPage {
  rows: AdminCustomerRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface CustomerListDbRow extends RowDataPacket {
  id: number;
  name: string | null;
  phone: string;
  email: string | null;
  loyalty_points: number;
  created_at: Date | string;
  order_count: number;
  lifetime_spend: string;
}

/**
 * A search term reduced to the digits worth matching a stored phone against.
 *
 * `customers.phone` holds a bare 10-digit Nepali mobile, so anything longer
 * that was typed carries a prefix the column does not: `+977`, `00977`, or a
 * trunk `0`. Taking the last ten digits makes `+977 9803-999930` find
 * `9803999930`, while a plain ten-digit number — including one that genuinely
 * starts `977` — is left exactly as it was typed.
 */
function phoneDigits(search: string): string {
  const digits = search.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/**
 * The shared WHERE for the list and its count. Every value is bound.
 *
 * `%` and `_` are escaped, or a search for "_" matches every customer — the
 * LIKE wildcards are the search term's own characters, not the user's intent.
 * The phone is additionally compared on digits alone, so a number typed with
 * +977, spaces or dashes still finds its row.
 */
function buildWhere(filters: AdminCustomerFilters): { where: string; params: (string | number)[] } {
  const clauses = ["1 = 1"];
  const params: (string | number)[] = [];

  const search = filters.search?.trim();
  if (search) {
    const like = `%${escapeLike(search)}%`;
    const digits = phoneDigits(search);
    if (digits.length >= 4) {
      clauses.push(
        "(c.name LIKE ? ESCAPE '\\\\' OR c.email LIKE ? ESCAPE '\\\\' OR c.phone LIKE ? ESCAPE '\\\\' OR REPLACE(REPLACE(REPLACE(c.phone,' ',''),'-',''),'+','') LIKE ?)",
      );
      params.push(like, like, like, `%${digits}%`);
    } else {
      clauses.push(
        "(c.name LIKE ? ESCAPE '\\\\' OR c.email LIKE ? ESCAPE '\\\\' OR c.phone LIKE ? ESCAPE '\\\\')",
      );
      params.push(like, like, like);
    }
  }

  return { where: clauses.join(" AND "), params };
}

export async function listAdminCustomers(filters: AdminCustomerFilters = {}): Promise<AdminCustomerPage> {
  const page = Math.max(1, filters.page ?? 1);
  const orderBy = SORTS[filters.sort ?? "recent"] ?? SORTS.recent;
  const { where, params } = buildWhere(filters);
  const spendGaps = NON_SPEND_STATUSES.map(() => "?").join(",");

  // One LEFT JOIN with conditional aggregation gives both figures in a single
  // pass. Correlated subqueries per column would run once per customer BEFORE
  // the LIMIT, which is the shape that stops scaling first.
  const [rows, [countRow]] = await Promise.all([
    query<CustomerListDbRow>(
      `SELECT c.id, c.phone, c.name, c.email, c.loyalty_points, c.created_at,
              COUNT(o.id) AS order_count,
              COALESCE(SUM(CASE WHEN o.status NOT IN (${spendGaps}) THEN o.total_amount ELSE 0 END), 0) AS lifetime_spend
         FROM customers c
         LEFT JOIN orders o ON o.customer_id = c.id AND o.deleted_at IS NULL
        WHERE ${where}
        GROUP BY c.id, c.phone, c.name, c.email, c.loyalty_points, c.created_at
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?`,
      // Every grouped column is listed explicitly rather than relying on the
      // server detecting the primary-key functional dependency, so the query is
      // correct with ONLY_FULL_GROUP_BY on or off.
      [...NON_SPEND_STATUSES, ...params, PAGE_SIZE, (page - 1) * PAGE_SIZE],
    ),
    query<RowDataPacket & { n: number }>(`SELECT COUNT(*) AS n FROM customers c WHERE ${where}`, params),
  ]);

  const total = Number(countRow?.n ?? 0);
  return {
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      email: r.email,
      orderCount: Number(r.order_count),
      lifetimeSpend: r.lifetime_spend,
      loyaltyPoints: Number(r.loyalty_points),
      joinedAt: iso(r.created_at)!,
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/* --- one customer ---------------------------------------------------------- */

export interface CustomerOrderRow {
  id: number;
  orderNumber: string;
  createdAt: string;
  status: string;
  statusLabel: string;
  statusColour: StatusColour;
  total: string;
  currency: string;
}

export interface CustomerLedgerEntry {
  id: string;
  orderId: number | null;
  delta: number;
  reason: string;
  balanceAfter: number | null;
  note: string | null;
  at: string;
  expiresAt: string | null;
}

export interface CustomerDetail {
  id: number;
  phone: string;
  name: string | null;
  email: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  /** `YYYY-MM-DD` or null — see `getCustomerDetail` on why these are formatted
   *  in SQL rather than derived from a Date. */
  dob: string | null;
  anniversary: string | null;
  ringSize: string | null;
  bangleSize: string | null;
  loyaltyPoints: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  /** Same definitions as the list, so the drawer and the row agree. */
  orderCount: number;
  lifetimeSpend: string;
  orders: CustomerOrderRow[];
  ledger: CustomerLedgerEntry[];
}

interface CustomerDbRow extends RowDataPacket {
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
  notes: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  order_count: number;
  lifetime_spend: string;
}

/**
 * One customer, with their orders and their loyalty ledger.
 *
 * `dob` and `anniversary` are DATE columns and are formatted by MySQL rather
 * than round-tripped through a JS `Date`: a bare DATE has no time zone, and
 * turning it into a Date and back is how a birthday lands on the 12th for a
 * customer born on the 13th. The two columns feed `<input type="date">`
 * directly, which wants exactly `YYYY-MM-DD`.
 *
 * The ledger is read-only here. `customers.loyalty_points` is the running
 * balance these rows reconcile to, so points are earned and redeemed by the
 * order flow that writes both together — never edited free-hand on this screen.
 */
export async function getCustomerDetail(id: number): Promise<CustomerDetail | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const spendGaps = NON_SPEND_STATUSES.map(() => "?").join(",");

  // The two aggregates ride along with the profile rather than being summed in
  // JS over the (capped) order list: it keeps them identical to the list's
  // figures, correct past the 200-row cap, and — the point — keeps the money in
  // SQL, so the total never touches a float on its way to the screen.
  const customer = await queryOne<CustomerDbRow>(
    `SELECT c.id, c.phone, c.name, c.email, c.address_line1, c.address_line2, c.city, c.state,
            c.postal_code, c.country, c.ring_size, c.bangle_size, c.loyalty_points, c.notes,
            c.created_at, c.updated_at,
            DATE_FORMAT(c.dob, '%Y-%m-%d') AS dob,
            DATE_FORMAT(c.anniversary, '%Y-%m-%d') AS anniversary,
            (SELECT COUNT(*) FROM orders o
              WHERE o.customer_id = c.id AND o.deleted_at IS NULL) AS order_count,
            (SELECT COALESCE(SUM(o.total_amount), 0) FROM orders o
              WHERE o.customer_id = c.id AND o.deleted_at IS NULL
                AND o.status NOT IN (${spendGaps})) AS lifetime_spend
       FROM customers c WHERE c.id = ? LIMIT 1`,
    [...NON_SPEND_STATUSES, id],
  );
  if (!customer) return null;

  const [orders, ledger] = await Promise.all([
    query<
      RowDataPacket & {
        id: number;
        order_number: string;
        created_at: Date | string;
        status: string;
        status_label: string | null;
        status_colour: string | null;
        total_amount: string;
        currency: string;
      }
    >(
      `SELECT o.id, o.order_number, o.created_at, o.status, o.total_amount, o.currency,
              s.label AS status_label, s.colour AS status_colour
         FROM orders o
         LEFT JOIN order_statuses s ON s.\`key\` = o.status
        WHERE o.customer_id = ? AND o.deleted_at IS NULL
        ORDER BY o.created_at DESC, o.id DESC
        LIMIT 200`,
      [id],
    ),
    query<
      RowDataPacket & {
        id: number;
        order_id: number | null;
        delta: number;
        reason: string;
        balance_after: number | null;
        note: string | null;
        created_at: Date | string;
        expires_at: Date | string | null;
      }
    >(
      `SELECT id, order_id, delta, reason, balance_after, note, created_at, expires_at
         FROM loyalty_ledger WHERE customer_id = ?
        ORDER BY created_at DESC, id DESC LIMIT 100`,
      [id],
    ),
  ]);

  return {
    id: customer.id,
    phone: customer.phone,
    name: customer.name,
    email: customer.email,
    addressLine1: customer.address_line1,
    addressLine2: customer.address_line2,
    city: customer.city,
    state: customer.state,
    postalCode: customer.postal_code,
    country: customer.country,
    dob: customer.dob,
    anniversary: customer.anniversary,
    ringSize: customer.ring_size,
    bangleSize: customer.bangle_size,
    loyaltyPoints: Number(customer.loyalty_points),
    notes: customer.notes,
    createdAt: iso(customer.created_at)!,
    updatedAt: iso(customer.updated_at)!,
    orderCount: Number(customer.order_count),
    lifetimeSpend: customer.lifetime_spend,
    orders: orders.map((o) => ({
      id: o.id,
      orderNumber: o.order_number,
      createdAt: iso(o.created_at)!,
      status: o.status,
      // A status row can only be missing if a key was removed out of band; the
      // key itself is a truthful last resort, and never a blank cell.
      statusLabel: o.status_label ?? o.status,
      statusColour: normaliseColour(o.status_colour),
      total: o.total_amount,
      currency: o.currency,
    })),
    ledger: ledger.map((l) => ({
      id: String(l.id),
      orderId: l.order_id,
      delta: Number(l.delta),
      reason: l.reason,
      balanceAfter: l.balance_after == null ? null : Number(l.balance_after),
      note: l.note,
      at: iso(l.created_at)!,
      expiresAt: iso(l.expires_at),
    })),
  };
}

/* --- the one edit ---------------------------------------------------------- */

export interface CustomerProfileInput {
  name: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  /** `YYYY-MM-DD`, or blank to clear. Anything else is stored as NULL. */
  dob: string;
  anniversary: string;
  ringSize: string;
  bangleSize: string;
  notes: string;
}

const text = (value: unknown, max: number): string | null => {
  const trimmed = String(value ?? "").trim().slice(0, max);
  return trimmed === "" ? null : trimmed;
};

/** A DATE column takes `YYYY-MM-DD` or nothing. A half-typed date clears the
 *  field rather than being coerced into a wrong day. */
const date = (value: unknown): string | null => {
  const trimmed = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
};

/**
 * The whitelist of editable columns, each with its own sanitiser.
 *
 * **`phone` is absent on purpose, and must stay absent.** It is the customer's
 * identity: `customers.phone` is UNIQUE, it is the key the order desk looks a
 * walk-in up by, and it is the handle the storefront sends an OTP to
 * (`customer_otp` / `customer_sessions`). Editing it here would silently move
 * someone's login to a number they do not hold, or collide with an existing row
 * and fail at the constraint. Correcting a wrong number is a merge, not an
 * edit, and it does not belong on this screen. `loyalty_points` is absent for
 * the same class of reason — it is a balance `loyalty_ledger` reconciles to,
 * not a field.
 *
 * A whitelist also means the UPDATE is built from keys this module names, never
 * from keys the client sent, so no request body can reach a column that is not
 * listed here.
 */
const EDITABLE_FIELDS: {
  readonly [K in keyof CustomerProfileInput]: { column: string; clean: (value: unknown) => string | null };
} = {
  name: { column: "name", clean: (v) => text(v, 120) },
  email: { column: "email", clean: (v) => text(String(v ?? "").toLowerCase(), 190) },
  addressLine1: { column: "address_line1", clean: (v) => text(v, 255) },
  addressLine2: { column: "address_line2", clean: (v) => text(v, 255) },
  city: { column: "city", clean: (v) => text(v, 120) },
  state: { column: "state", clean: (v) => text(v, 120) },
  postalCode: { column: "postal_code", clean: (v) => text(v, 30) },
  country: { column: "country", clean: (v) => text(v, 100) },
  dob: { column: "dob", clean: date },
  anniversary: { column: "anniversary", clean: date },
  ringSize: { column: "ring_size", clean: (v) => text(v, 40) },
  bangleSize: { column: "bangle_size", clean: (v) => text(v, 40) },
  notes: { column: "notes", clean: (v) => text(v, 2000) },
};

const EDITABLE_KEYS = Object.keys(EDITABLE_FIELDS) as (keyof CustomerProfileInput)[];

/**
 * Update the fields a patch actually carries.
 *
 * Only keys present in the patch are written, so the drawer's two independent
 * editors cannot clobber each other: saving "Personal details" never rewrites
 * the address with whatever the other section happened to be holding.
 *
 * One table, but still a transaction, because `recordAdminAction` must share
 * the connection of the change it records — otherwise a rolled-back edit can
 * leave a log line claiming it happened.
 */
export async function updateCustomerProfile(
  admin: AdminContext,
  id: number,
  patch: Partial<CustomerProfileInput>,
): Promise<void> {
  if (!Number.isInteger(id) || id <= 0) throw new Error("That customer no longer exists.");

  const sets: string[] = [];
  const params: (string | null)[] = [];
  const changed: string[] = [];
  for (const key of EDITABLE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    const field = EDITABLE_FIELDS[key];
    sets.push(`${field.column} = ?`);
    params.push(field.clean(patch[key]));
    changed.push(field.column);
  }
  if (sets.length === 0) throw new Error("There was nothing to save.");

  await transaction(async (connection) => {
    // `phone` is not in `sets` and cannot be: the columns come from
    // EDITABLE_FIELDS, which does not name it.
    const [result] = await connection.execute<ResultSetHeader>(
      `UPDATE customers SET ${sets.join(", ")} WHERE id = ?`,
      [...params, id],
    );
    if (result.affectedRows === 0) throw new Error("That customer no longer exists.");

    await recordAdminAction(connection, admin, {
      action: "customers.update",
      resourceType: "customers",
      resourceId: id,
      metadata: { fields: changed },
    });
  });
}
