#!/usr/bin/env node
/**
 * Admin sign-in and authorization checks.
 *
 * The admin boundary has no end-to-end test — there is no seeded password to log
 * in with in CI, and there must not be. So the rules that hold it up are kept
 * pure in lib/admin/rbac.ts and lib/admin/login-rules.ts and asserted here on
 * every commit, exactly as scripts/check-auth.mts does for the customer OTP.
 *
 * Two checks carry the most weight:
 *
 *   - The lockout race, against the real database. The reference has no lockout
 *     at all; the one added here must survive the same concurrency the OTP cap
 *     was fixed for — twenty parallel failures cannot slip past the cap.
 *   - The decision table. An unknown email and a wrong password must be one
 *     outcome with one message, or the login page becomes an oracle for which
 *     emails are real admins.
 *
 * Run: npx tsx scripts/check-admin-auth.mts
 */
import { createConnection } from "mysql2/promise";
import { readFileSync } from "node:fs";
import {
  ADMIN_SECTIONS,
  SECTION_KEYS,
  authorizeSection,
  landingPath,
  parseSections,
  publicAdmin,
} from "../lib/admin/rbac";
import {
  ADMIN_LOCK_MINUTES,
  ADMIN_MAX_FAILED_ATTEMPTS,
  clearFailuresSql,
  evaluateLogin,
  isLocked,
  loginMessage,
  registerFailureSql,
} from "../lib/admin/login-rules";

const checks: [string, boolean][] = [];

// --- the section catalogue --------------------------------------------------
//
// Fix #2 from the plan: a section the map declares but no route enforces is a
// grant that protects nothing. These assert the map is internally coherent; the
// route-coverage half lands as the admin pages do.

const keys = ADMIN_SECTIONS.map((s) => s.key);
const paths = ADMIN_SECTIONS.map((s) => s.path);
checks.push(
  ["every section has a key, label and path", ADMIN_SECTIONS.every((s) => s.key && s.label && s.path)],
  ["section keys are unique", new Set(keys).size === keys.length],
  ["section paths are unique — no two sections claim one page", new Set(paths).size === paths.length],
  ["every section path is under /admin/", paths.every((p) => p.startsWith("/admin/"))],
  ["SECTION_KEYS matches the catalogue", SECTION_KEYS.size === keys.length && keys.every((k) => SECTION_KEYS.has(k))],
);

// --- parseSections fails closed ---------------------------------------------

const firstKey = keys[0];
checks.push(
  ["a valid grant is kept", parseSections(JSON.stringify([firstKey])).has(firstKey)],
  ["an unknown key is dropped", parseSections(JSON.stringify([firstKey, "not_a_section"])).size === 1],
  ["a grant of only unknown keys is empty", parseSections(JSON.stringify(["nope", "also_nope"])).size === 0],
  ["malformed JSON denies rather than throws", parseSections("{ this is not json").size === 0],
  ["a non-array denies", parseSections(JSON.stringify({ [firstKey]: true })).size === 0],
  ["null denies", parseSections(null).size === 0],
  ["a raw array (not a string) is accepted", parseSections([firstKey]).has(firstKey)],
  ["a non-string element is ignored", parseSections([firstKey, 42, null]).size === 1],
);

// --- authorizeSection: deny by default, owner bypass ------------------------

const owner = { isOwner: true, sections: [] as string[] };
const staffer = { isOwner: false, sections: [firstKey] };
const secondKey = keys[1];
checks.push(
  ["the owner may touch any section", authorizeSection(owner, firstKey) && authorizeSection(owner, secondKey)],
  ["the owner may touch a section that does not exist either", authorizeSection(owner, "anything")],
  ["a staffer may touch a granted section", authorizeSection(staffer, firstKey)],
  ["a staffer may NOT touch an ungranted section", !authorizeSection(staffer, secondKey)],
  ["a staffer may NOT touch an unknown section", !authorizeSection(staffer, "prodcuts")],
  ["a staffer with no grants is refused everything", !authorizeSection({ isOwner: false, sections: [] }, firstKey)],
);

// --- landingPath ------------------------------------------------------------

checks.push(
  ["the owner lands on the admin home", landingPath(owner) === "/admin"],
  ["a staffer lands on their first granted section", landingPath(staffer) === ADMIN_SECTIONS[0].path],
  [
    "a staffer granted only the second section lands there",
    landingPath({ isOwner: false, sections: [secondKey] }) === ADMIN_SECTIONS[1].path,
  ],
  ["a staffer with no grants falls back to the admin home", landingPath({ isOwner: false, sections: [] }) === "/admin"],
);

// --- publicAdmin is an allowlist, not a blocklist ---------------------------
//
// The projection must carry only the four safe fields. A password hash or a
// lockout counter joined in by accident cannot ride along, because the shape is
// built by naming what is kept, not by deleting what is not.

const dangerousRow = {
  id: 7,
  email: "owner@sazuna.test",
  name: "Owner",
  role_id: null,
  password_hash: "$2b$10$AAAAAAAAAAAAAAAAAAAAAA",
  failed_attempts: 3,
  locked_until: "2999-01-01 00:00:00",
  secret_key: "sk_live_should_never_appear",
};
const projectedOwner = publicAdmin(dangerousRow);
const projectedJson = JSON.stringify(projectedOwner);
const staffRow = {
  id: 8,
  email: "staff@sazuna.test",
  name: "Staff",
  role_id: 2,
  allowed_sections: JSON.stringify([firstKey, "not_a_section"]),
};
const projectedStaff = publicAdmin(staffRow);

checks.push(
  ["publicAdmin marks a NULL role_id as owner", projectedOwner.isOwner === true],
  ["publicAdmin gives the owner no section list to leak", projectedOwner.sections.length === 0],
  ["publicAdmin marks a non-null role_id as staff", projectedStaff.isOwner === false],
  ["publicAdmin parses a staffer's grants, dropping unknowns", projectedStaff.sections.length === 1],
  ["publicAdmin carries NO password_hash", !projectedJson.includes("password_hash") && !projectedJson.includes("$2b$")],
  ["publicAdmin carries NO lockout counters", !projectedJson.includes("failed_attempts") && !projectedJson.includes("locked_until")],
  ["publicAdmin carries NO stray secret", !projectedJson.includes("sk_live") && !projectedJson.includes("secret")],
);

// --- the decision table: unknown email == wrong password --------------------

const unknownEmail = evaluateLogin({ locked: false, userExists: false, passwordValid: false, isActive: false });
const wrongPassword = evaluateLogin({ locked: false, userExists: true, passwordValid: false, isActive: true });
const deactivated = evaluateLogin({ locked: false, userExists: true, passwordValid: true, isActive: false });
const good = evaluateLogin({ locked: false, userExists: true, passwordValid: true, isActive: true });
const lockedRightPassword = evaluateLogin({ locked: true, userExists: true, passwordValid: true, isActive: true });

checks.push(
  ["an unknown email is 'invalid'", unknownEmail === "invalid"],
  ["a wrong password is 'invalid'", wrongPassword === "invalid"],
  ["the two are the SAME outcome", unknownEmail === wrongPassword],
  ["and carry the SAME message", loginMessage(unknownEmail) === loginMessage(wrongPassword)],
  ["a deactivated account with the right password is still 'invalid'", deactivated === "invalid"],
  ["good credentials are 'ok'", good === "ok"],
  ["a locked account is refused even with the right password", lockedRightPassword === "locked"],
  ["the locked message differs from the invalid one", loginMessage("locked") !== loginMessage("invalid")],
  ["isLocked is false for a null lock", !isLocked(null)],
  ["isLocked is false for a lapsed lock", !isLocked(new Date(Date.now() - 60_000))],
  ["isLocked is true for a future lock", isLocked(new Date(Date.now() + 60_000))],
);

// --- the lockout race, against the real database ----------------------------
//
// Skipped rather than failed without credentials — the production build runs
// without them by design, and CI must stay green there.

function loadEnv(file: string) {
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const match = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* no env file — fall through to the skip below */
  }
}
loadEnv(".env.local");
loadEnv(".env");

const dbConfigured = Boolean(process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME);

if (!dbConfigured) {
  console.log("SKIP  lockout holds under concurrent failures (no database credentials)");
} else {
  const db = await createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  // A reserved email that cannot be a real admin. Cleaned up either way.
  const email = "__check_admin_auth__@sazuna.invalid";
  await db.execute("DELETE FROM admin_users WHERE email = ?", [email]);

  async function freshAdmin(failedStart: number): Promise<number> {
    await db.execute(
      `INSERT INTO admin_users (email, password_hash, is_active, failed_attempts, role_id)
       VALUES (?, '$2b$10$AAAAAAAAAAAAAAAAAAAAAA', 1, ?, NULL)
       ON DUPLICATE KEY UPDATE failed_attempts = VALUES(failed_attempts), locked_until = NULL`,
      [email, failedStart],
    );
    const [[row]] = (await db.query("SELECT id FROM admin_users WHERE email = ? LIMIT 1", [email])) as [
      { id: number }[],
      unknown,
    ];
    return row.id;
  }

  async function readAdmin(id: number) {
    // Ask the database whether the lock holds — `locked_until > NOW()` — rather
    // than reading the DATETIME into JS and comparing, which would make this
    // check hostage to the driver's timezone handling. This is the exact
    // predicate signInWithPassword uses.
    const [[row]] = (await db.query(
      "SELECT failed_attempts, (locked_until IS NOT NULL AND locked_until > NOW()) AS is_locked FROM admin_users WHERE id = ?",
      [id],
    )) as [{ failed_attempts: number; is_locked: number }[], unknown];
    return row;
  }

  // 20 simultaneous failures against a cap of 5. A read-modify-write would land
  // on failed_attempts = 1, unlocked. The atomic UPDATE must reach the cap and
  // trip the lock.
  const raceId = await freshAdmin(0);
  await Promise.all(
    Array.from({ length: 20 }, () =>
      db.execute(registerFailureSql, [ADMIN_MAX_FAILED_ATTEMPTS, ADMIN_LOCK_MINUTES, raceId]),
    ),
  );
  const raced = await readAdmin(raceId);

  // The clause-order guard: at cap-1, ONE failure must lock (reaches the cap
  // exactly). At cap-2, ONE failure must NOT lock. Swapping the SET clauses
  // breaks one of these.
  const edgeId = await freshAdmin(ADMIN_MAX_FAILED_ATTEMPTS - 1);
  await db.execute(registerFailureSql, [ADMIN_MAX_FAILED_ATTEMPTS, ADMIN_LOCK_MINUTES, edgeId]);
  const edgeLocked = await readAdmin(edgeId);

  const earlyId = await freshAdmin(ADMIN_MAX_FAILED_ATTEMPTS - 2);
  await db.execute(registerFailureSql, [ADMIN_MAX_FAILED_ATTEMPTS, ADMIN_LOCK_MINUTES, earlyId]);
  const earlyUnlocked = await readAdmin(earlyId);

  // A clean sign-in clears the slate.
  await db.execute(clearFailuresSql, [raceId]);
  const cleared = await readAdmin(raceId);

  console.log(
    `      (20 parallel failures against a cap of ${ADMIN_MAX_FAILED_ATTEMPTS} → attempts=${raced.failed_attempts}, locked=${Boolean(raced.is_locked)})`,
  );

  checks.push(
    ["concurrent failures reach the attempt cap", raced.failed_attempts >= ADMIN_MAX_FAILED_ATTEMPTS],
    ["the account locks once the cap is reached", Boolean(raced.is_locked)],
    ["one failure at cap-1 trips the lock (clause order)", Boolean(edgeLocked.is_locked)],
    ["one failure at cap-2 does NOT lock (no early trip)", !earlyUnlocked.is_locked],
    ["a clean sign-in clears the count and the lock", cleared.failed_attempts === 0 && !cleared.is_locked],
  );

  await db.execute("DELETE FROM admin_users WHERE email = ?", [email]);
  await db.end();
}

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}
console.log(`\n${checks.length - failed} passed, ${failed} failed`);
if (failed) {
  console.error(
    "\n✗ admin auth checks FAILED — this is the authorization boundary, and it has no\n" +
      "  end-to-end test to fall back on. Fix lib/admin/rbac.ts or login-rules.ts rather\n" +
      "  than relaxing a check.",
  );
}
process.exit(failed ? 1 : 0);
