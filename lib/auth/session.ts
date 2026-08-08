import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import type { RowDataPacket } from "mysql2";
import { execute, queryOne } from "../db";
import type { CustomerRow } from "../customer-projection";

/**
 * Customer sign-in sessions.
 *
 * An opaque random token in an httpOnly cookie, with the session itself living
 * in `customer_sessions`. Deliberately not the reference app's model, which
 * issues a 30-day HS256 JWT into `localStorage` and reads it back from a Bearer
 * header. That design has no revocation at all — no jti, no denylist, no
 * server-side re-read — so signing out, deleting an account and "sign out
 * everywhere" are all cosmetic for a month; and its own audit documents three
 * stored-XSS primitives on that origin, any of which lifts the token straight
 * out of storage.
 *
 * Here the cookie is unreadable to JavaScript, and revoking a session is a
 * DELETE. The two audiences stay isolated structurally rather than by deriving
 * distinct signing keys: the admin arriving in the next stage gets its own
 * table and its own cookie name, so a customer credential is not merely
 * rejected there — it is not even a thing that can be presented.
 */

const COOKIE = "sazuna_session";
const TOKEN_BYTES = 32;
const TTL_DAYS = 30;
const TTL_SECONDS = TTL_DAYS * 24 * 60 * 60;

/** How stale `last_seen_at` may get before a read bothers to touch it. */
const TOUCH_AFTER_SECONDS = 60 * 60;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

interface SessionCustomerRow extends RowDataPacket {
  session_id: number;
  customer_id: number;
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
  stale: number;
}

/**
 * Start a session and set the cookie.
 *
 * Only callable from a Server Action or a Route Handler — Next forbids writing
 * cookies during a render, which is the right restriction and the reason
 * sign-in is an action rather than something a page does on the way past.
 */
export async function createSession(customerId: number): Promise<void> {
  const token = randomBytes(TOKEN_BYTES).toString("hex");

  // Only the digest is stored. A leaked table therefore yields no usable
  // session — and with 32 bytes of CSPRNG input there is no dictionary to run,
  // so an unsalted, un-stretched hash is the right tool rather than a password
  // KDF.
  const userAgent = (await headers()).get("user-agent")?.slice(0, 255) ?? null;

  await execute(
    `INSERT INTO customer_sessions (customer_id, token_hash, user_agent, expires_at)
     VALUES (?, ?, ?, NOW() + INTERVAL ? SECOND)`,
    [customerId, hashToken(token), userAgent, TTL_SECONDS],
  );

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    // Off only on the dev server, which is plain http on localhost.
    secure: process.env.NODE_ENV === "production",
    // Lax, not Strict: nothing cross-site needs to POST with this, and Strict
    // would drop the session when a customer follows a link from their own
    // order-confirmation email back into the site.
    sameSite: "lax",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

/**
 * The signed-in customer, or null.
 *
 * Safe to call from a render: it reads the cookie and writes only to the
 * database. The session row is re-read on every request, which is what makes
 * revocation real — a deleted session or a deleted customer stops working at
 * once rather than when a token happens to expire.
 */
export async function currentCustomer(): Promise<CustomerRow | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;

  const row = await queryOne<SessionCustomerRow>(
    `SELECT s.id AS session_id, c.id AS customer_id,
            c.phone, c.name, c.email,
            c.address_line1, c.address_line2, c.city, c.state, c.postal_code, c.country,
            DATE_FORMAT(c.dob, '%Y-%m-%d') AS dob,
            DATE_FORMAT(c.anniversary, '%Y-%m-%d') AS anniversary,
            c.ring_size, c.bangle_size, c.loyalty_points, c.notes, c.created_at,
            (s.last_seen_at < NOW() - INTERVAL ? SECOND) AS stale
       FROM customer_sessions s
       JOIN customers c ON c.id = s.customer_id
      WHERE s.token_hash = ? AND s.expires_at > NOW()
      LIMIT 1`,
    [TOUCH_AFTER_SECONDS, hashToken(token)],
  );
  if (!row) return null;

  /**
   * Roll the session forward, but at most once an hour. Touching it on every
   * page view would be a write per request for no benefit; never touching it
   * would sign out a customer who uses the shop weekly, thirty days after they
   * first signed in.
   */
  if (row.stale) {
    await execute(
      `UPDATE customer_sessions
          SET last_seen_at = NOW(), expires_at = NOW() + INTERVAL ? SECOND
        WHERE id = ?`,
      [TTL_SECONDS, row.session_id],
    );
  }

  // Reshape into the row every other customer function expects.
  return { ...row, id: row.customer_id } as unknown as CustomerRow;
}

/** End this session. The row goes, so the token is dead everywhere at once. */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;

  if (token) {
    await execute("DELETE FROM customer_sessions WHERE token_hash = ?", [hashToken(token)]);
  }
  jar.delete(COOKIE);
}

/**
 * Drop every session for a customer.
 *
 * Not wired to a button yet; it is what account deletion and a future "sign out
 * everywhere" both need, and it exists so that deleting a customer is not the
 * only way to achieve it.
 */
export async function destroyAllSessions(customerId: number): Promise<void> {
  await execute("DELETE FROM customer_sessions WHERE customer_id = ?", [customerId]);
}

/** Housekeeping, for whenever a scheduled task exists to call it. */
export async function purgeExpiredSessions(): Promise<void> {
  try {
    await execute("DELETE FROM customer_sessions WHERE expires_at < NOW()");
  } catch (error) {
    console.error("[session] purge failed", error);
  }
}
