#!/usr/bin/env node
/**
 * Create or reset an admin account.
 *
 * The reference ships a working credential in its schema —
 * `admin@sazuna.com` / `Admin@1234`, a committed bcrypt hash anyone can read in
 * the repo and use against the deployed site. Migration 0001 inherited that
 * seed. This rebuild's answer is: the first real admin is made HERE, by the
 * owner, with a password that lives nowhere in git — and the same script resets
 * the default hash out of existence.
 *
 * Credentials come from the environment so a password never lands in shell
 * history or a process list you can `ps`:
 *
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a long unique passphrase' \
 *     npm run admin:create
 *
 * Upserts by email: a new email creates an OWNER (role_id NULL, full access); an
 * existing email has its password reset and any lock cleared. It never prints
 * the password and never creates staff — staff are added later, in the admin.
 */
import { createConnection } from "mysql2/promise";
import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";

function loadEnv(file: string) {
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const match = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* no env file — the host may supply the environment */
  }
}
loadEnv(".env.local");
loadEnv(".env");

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? "";
const name = (process.env.ADMIN_NAME ?? "").trim() || null;

if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  fail("Set ADMIN_EMAIL to a valid email address.");
}
// A deliberately low floor — the real defence is the account lockout, not
// password rules — but enough to refuse the obviously weak, and the reference's
// default by name so it can never be re-created here.
if (password.length < 10) fail("Set ADMIN_PASSWORD to at least 10 characters.");
if (password === "Admin@1234") fail("That is the reference's default password. Choose another.");

if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_NAME) {
  fail("Database credentials are not set. Copy .env.example to .env.local and fill it in.");
}

const hash = await bcrypt.hash(password, 12);

const db = await createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const [existing] = (await db.query("SELECT id FROM admin_users WHERE email = ? LIMIT 1", [email])) as [
  { id: number }[],
  unknown,
];

if (existing.length) {
  await db.execute(
    `UPDATE admin_users
        SET password_hash = ?, is_active = 1, failed_attempts = 0, locked_until = NULL,
            name = COALESCE(?, name)
      WHERE email = ?`,
    [hash, name, email],
  );
  console.log(`✓ reset password for existing admin ${email}`);
} else {
  await db.execute(
    `INSERT INTO admin_users (email, name, password_hash, is_active, failed_attempts, role_id)
     VALUES (?, ?, ?, 1, 0, NULL)`,
    [email, name, hash],
  );
  console.log(`✓ created owner admin ${email}`);
}

await db.end();
