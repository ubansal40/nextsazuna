import "server-only";

import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import type { RowDataPacket } from "mysql2";
import { execute, queryOne } from "../db";
import {
  ADMIN_LOCK_MINUTES,
  ADMIN_MAX_FAILED_ATTEMPTS,
  clearFailuresSql,
  evaluateLogin,
  registerFailureSql,
  type LoginOutcome,
} from "./login-rules";
import { publicAdmin, type AdminContext } from "./rbac";

/**
 * Admin sign-in sessions and the sign-in itself.
 *
 * The session half is the twin of lib/auth/session.ts, deliberately not shared
 * with it. Its own table (`admin_sessions`), its own cookie (`sazuna_admin`),
 * its own opaque token hashed at rest. The two audiences are isolated
 * structurally: a customer session cookie presented here matches no admin row
 * and is simply not a credential — there is no code path where one could be
 * mistaken for the other.
 *
 * Unlike the reference admin's 8-hour JWT, the row is re-read on every request,
 * so deactivating an admin or changing their role takes hold on the next
 * request rather than up to eight hours later, and signing out is a DELETE that
 * actually ends the session everywhere.
 */

const COOKIE = "sazuna_admin";
const TOKEN_BYTES = 32;
/**
 * Eight hours of inactivity ends a session — the reference's token lifetime,
 * but as an idle timeout rather than a hard expiry. An admin working through the
 * day stays in because each active request past the touch interval rolls the
 * clock forward; a session left open on an unattended machine dies by evening.
 */
const TTL_SECONDS = 8 * 60 * 60;

/** How stale `last_seen_at` may get before a read bothers to roll it forward. */
const TOUCH_AFTER_SECONDS = 15 * 60;

/**
 * A valid bcrypt hash of nothing anyone knows. When an email matches no admin,
 * the password is still compared against this so the response time does not
 * betray whether the account exists — the timing twin of returning the same
 * `invalid` message. The compare always fails; the value is never a password.
 */
const DUMMY_PASSWORD_HASH = "$2b$10$zxwJttZ9a/CcALQpwotcPelZCr3iDp3349HfVg2CQMqkuVbHZYF8m";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

interface AdminLoginRow extends RowDataPacket {
  id: number;
  email: string;
  name: string | null;
  password_hash: string;
  is_active: number;
  role_id: number | null;
  /** Decided by the database (`locked_until > NOW()`), not read into JS and
   *  compared here — so the lock does not depend on the driver's timezone
   *  handling agreeing with the process clock. 1 while a lock holds, else 0. */
  is_locked: number;
}

interface SessionAdminRow extends RowDataPacket {
  session_id: number;
  id: number;
  email: string;
  name: string | null;
  role_id: number | null;
  is_active: number;
  allowed_sections: unknown;
  stale: number;
}

/**
 * Verify a sign-in and, on success, start a session.
 *
 * Resolves rather than rejects — the login form advances on the returned value
 * and a throw would strand the operator on a blank screen. The password is
 * re-checked here regardless of anything the client did; a Server Action is a
 * public endpoint.
 *
 * The lockout is enforced in the database, atomically (see registerFailureSql),
 * so a burst of parallel guesses cannot outrun the counter. The per-IP
 * `rateLimit` in the calling action is a supplementary speed bump, not this.
 */
export async function signInWithPassword(
  emailRaw: string,
  passwordRaw: string,
): Promise<{ outcome: LoginOutcome; context?: AdminContext }> {
  const email = String(emailRaw ?? "").trim().toLowerCase();
  const password = String(passwordRaw ?? "");

  try {
    const user = await queryOne<AdminLoginRow>(
      `SELECT id, email, name, password_hash, is_active, role_id,
              (locked_until IS NOT NULL AND locked_until > NOW()) AS is_locked
         FROM admin_users
        WHERE email = ?
        LIMIT 1`,
      [email],
    );

    const locked = Boolean(user?.is_locked);

    // Always run one compare, against the real hash or the dummy, so the timing
    // is the same whether or not the email exists. `locked` short-circuits it —
    // there is nothing to learn from timing an account you already know is real.
    const passwordValid = locked
      ? false
      : await bcrypt.compare(password, user?.password_hash ?? DUMMY_PASSWORD_HASH);

    const outcome = evaluateLogin({
      locked,
      userExists: Boolean(user),
      passwordValid,
      isActive: Boolean(user?.is_active),
    });

    if (outcome === "ok" && user) {
      await execute(clearFailuresSql, [user.id]);
      await createAdminSession(user.id);
      return {
        outcome,
        context: publicAdmin({ id: user.id, email: user.email, name: user.name, role_id: user.role_id }),
      };
    }

    // Count the failure only against a real account — there is no row to
    // increment for an unknown email, and inventing one would leak existence.
    // A wrong password on a real account, active or not, counts.
    if (user && !locked) {
      await execute(registerFailureSql, [ADMIN_MAX_FAILED_ATTEMPTS, ADMIN_LOCK_MINUTES, user.id]);
    }

    return { outcome };
  } catch (error) {
    // The reference returns the raw driver message from its unauthenticated
    // login route, handing schema names to anyone hammering it. Log the detail,
    // return a bare outcome.
    console.error("[admin] sign-in failed", error);
    return { outcome: "error" };
  }
}

/**
 * Start an admin session and set the cookie.
 *
 * Callable only from a Server Action or Route Handler — Next forbids writing
 * cookies during render, which is why sign-in is an action.
 */
export async function createAdminSession(adminId: number): Promise<void> {
  const token = randomBytes(TOKEN_BYTES).toString("hex");
  const userAgent = (await headers()).get("user-agent")?.slice(0, 255) ?? null;

  await execute(
    `INSERT INTO admin_sessions (admin_id, token_hash, user_agent, expires_at)
     VALUES (?, ?, ?, NOW() + INTERVAL ? SECOND)`,
    [adminId, hashToken(token), userAgent, TTL_SECONDS],
  );

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // Lax is enough: nothing cross-site posts with this, and the admin only ever
    // arrives by typing the URL or following its own links.
    sameSite: "lax",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

/**
 * The signed-in admin, or null.
 *
 * Safe to call from a render. Re-reads the session and the role on every
 * request — the join to `staff_roles` is what makes a role change take effect at
 * once — and returns the buffer-safe `AdminContext`, never the password hash or
 * the lockout counters.
 */
export async function currentAdmin(): Promise<AdminContext | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;

  const row = await queryOne<SessionAdminRow>(
    `SELECT s.id AS session_id,
            a.id, a.email, a.name, a.role_id, a.is_active,
            r.allowed_sections,
            (s.last_seen_at < NOW() - INTERVAL ? SECOND) AS stale
       FROM admin_sessions s
       JOIN admin_users a ON a.id = s.admin_id
       LEFT JOIN staff_roles r ON r.id = a.role_id
      WHERE s.token_hash = ? AND s.expires_at > NOW()
      LIMIT 1`,
    [TOUCH_AFTER_SECONDS, hashToken(token)],
  );

  // No row, or the account was deactivated since the session was issued — the
  // per-request re-read is exactly what makes that second case take effect now.
  if (!row || !row.is_active) return null;

  if (row.stale) {
    await execute(
      `UPDATE admin_sessions
          SET last_seen_at = NOW(), expires_at = NOW() + INTERVAL ? SECOND
        WHERE id = ?`,
      [TTL_SECONDS, row.session_id],
    );
  }

  return publicAdmin(row);
}

/** End this session. The row goes, so the token is dead everywhere at once. */
export async function destroyAdminSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    await execute("DELETE FROM admin_sessions WHERE token_hash = ?", [hashToken(token)]);
  }
  jar.delete(COOKIE);
}

/** Drop every session for an admin — what deactivation and "sign out everywhere"
 *  both need. */
export async function destroyAllAdminSessions(adminId: number): Promise<void> {
  await execute("DELETE FROM admin_sessions WHERE admin_id = ?", [adminId]);
}

/** Housekeeping, for whenever a scheduled task exists to call it. */
export async function purgeExpiredAdminSessions(): Promise<void> {
  try {
    await execute("DELETE FROM admin_sessions WHERE expires_at < NOW()");
  } catch (error) {
    console.error("[admin] session purge failed", error);
  }
}
