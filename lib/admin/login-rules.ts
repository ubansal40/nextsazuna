/**
 * Admin sign-in rules — the parts with no database and no bcrypt in them.
 *
 * The same split as lib/auth/otp-rules.ts: sign-in is a boundary with no
 * end-to-end test, so the load-bearing logic lives here, pure, and
 * scripts/check-admin-auth.mts asserts it — the lockout race against the real
 * database, and the decision table that must answer identically for an unknown
 * email and a wrong password.
 */

/** Consecutive failures that trip a lock. Five is generous for the one real
 *  operator and still turns a 10^n password space into a crawl. */
export const ADMIN_MAX_FAILED_ATTEMPTS = 5;

/** How long a tripped lock holds. Long enough to make online guessing pointless,
 *  short enough that the owner fat-fingering their password is a coffee break,
 *  not a support ticket. */
export const ADMIN_LOCK_MINUTES = 15;

/**
 * Count a failed sign-in and lock the account if that failure hit the cap —
 * atomically, in one statement.
 *
 * This is the admin analogue of `consumeAttemptSql`, and it carries the same
 * fix. Reading `failed_attempts` into JavaScript, adding one, and writing it
 * back lets concurrent attempts all read the same value and all write the same
 * increment, so the counter never reaches the cap and the lock never trips. The
 * database has to do the arithmetic for the guard to hold under a burst.
 *
 * ORDER OF THE SET CLAUSES IS LOAD-BEARING. MySQL evaluates assignments left to
 * right and a later one sees the value a column was just given. `locked_until`
 * is assigned FIRST so its `IF` reads the pre-increment `failed_attempts` and
 * tests `failed_attempts + 1 >= cap` — the count this very attempt reaches. Swap
 * the two and the `IF` reads the already-incremented value, testing
 * `failed_attempts + 2 >= cap`, and the account locks one failure early. This is
 * the exact bug the reference app's own audit shipped in its suggested OTP fix.
 *
 * Params, in order: cap, lockMinutes, adminId.
 */
export const registerFailureSql = `
  UPDATE admin_users
     SET locked_until = IF(failed_attempts + 1 >= ?, NOW() + INTERVAL ? MINUTE, locked_until),
         failed_attempts = failed_attempts + 1
   WHERE id = ?`;

/**
 * Wipe the failure count and any lock on a clean sign-in. A successful login is
 * proof the operator is who they say, so their slate is cleared; otherwise five
 * lifetime typos across months would eventually lock a valid account.
 *
 * Param: adminId.
 */
export const clearFailuresSql = `
  UPDATE admin_users
     SET failed_attempts = 0, locked_until = NULL
   WHERE id = ?`;

/** Is a lock still in force? NULL means never locked; a past time means it has
 *  lapsed and the next attempt is allowed. */
export function isLocked(lockedUntil: Date | string | null | undefined, now: Date = new Date()): boolean {
  if (lockedUntil == null) return false;
  const until = lockedUntil instanceof Date ? lockedUntil : new Date(lockedUntil);
  return until.getTime() > now.getTime();
}

/**
 * What a sign-in attempt produced.
 *
 *   ok      credentials good, account active and unlocked — issue a session.
 *   invalid unknown email, wrong password, or a deactivated account. The three
 *           are ONE outcome on purpose: telling them apart turns the endpoint
 *           into an oracle for which emails are real admins.
 *   locked  the account is inside its lockout window; the password is not even
 *           checked. This is a distinct message because it is only reachable by
 *           someone who already made five failed attempts on that exact email,
 *           so it reveals nothing they had not already assumed.
 *   error   the attempt could not be evaluated (a database fault). Never leaks
 *           detail to the caller; the detail goes to the server log.
 */
export type LoginOutcome = "ok" | "invalid" | "locked" | "error";

export const INVALID_MESSAGE = "Email or password is incorrect.";
export const LOCKED_MESSAGE = "Too many attempts. Please wait a few minutes and try again.";
export const ERROR_MESSAGE = "Sign-in is temporarily unavailable. Please try again.";

/**
 * The decision table, pure. Given only booleans, return the outcome — so the
 * check script can prove an unknown email (`userExists: false`) and a wrong
 * password (`passwordValid: false`) collapse to the identical `invalid`, with no
 * timing or wording that could tell them apart.
 *
 * `locked` is answered before anything else: a locked account is refused whether
 * or not the password is right.
 */
export function evaluateLogin(input: {
  locked: boolean;
  userExists: boolean;
  passwordValid: boolean;
  isActive: boolean;
}): LoginOutcome {
  if (input.locked) return "locked";
  if (!input.userExists || !input.passwordValid || !input.isActive) return "invalid";
  return "ok";
}

/** The user-facing message for an outcome. `ok` has none — it navigates. */
export function loginMessage(outcome: LoginOutcome): string {
  switch (outcome) {
    case "locked":
      return LOCKED_MESSAGE;
    case "error":
      return ERROR_MESSAGE;
    default:
      return INVALID_MESSAGE;
  }
}
