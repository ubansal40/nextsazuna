-- 0008_admin_sessions_and_lockout.sql
--
-- The auth substrate for the admin console. Two DDL changes, no data: a session
-- table and the two columns a database-enforced login lockout needs.
--
-- Both concerns are the same one — how an administrator signs in — and both are
-- pure DDL, so the README's "one concern per file" rule (which exists to keep
-- DDL from sharing a file with data changes that could half-apply) is honoured.
--
--
-- WHY A TABLE AND NOT A JWT
--
-- The reference admin signs in exactly the way its customer portal does, and
-- inherits every one of that design's faults: an 8-hour HS256 JWT handed to the
-- browser, kept in localStorage, replayed as a Bearer header. There is no
-- server-side session, so `requireAdmin` verifies the signature and never reads
-- the database — which means deactivating a staff account, or changing their
-- role, does nothing until the token expires up to eight hours later. On an
-- origin whose own audit documents working stored-XSS, a token in localStorage
-- is also a token an attacker can lift.
--
-- `admin_sessions` is the same fix `customer_sessions` was, and deliberately its
-- twin rather than its tenant. The two audiences are kept apart structurally,
-- not by deriving distinct keys from one secret: the admin gets its own table
-- and its own cookie name (`sazuna_admin`), so a customer credential presented
-- to the admin is not merely rejected — it is not a thing that can be presented.
-- The cookie carries an opaque random token and nothing else; the row is the
-- session; revoking it is a DELETE, so it actually happens, on the next request.

CREATE TABLE IF NOT EXISTS admin_sessions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  admin_id INT NOT NULL,
  -- Hex SHA-256 of the cookie value, never the value itself. UNIQUE so a lookup
  -- is one index hit and a duplicate token is impossible rather than unlikely.
  -- Unsalted and un-stretched is correct here: the input is 32 bytes of CSPRNG
  -- output, so there is no dictionary to run and nothing to slow down. A leaked
  -- table therefore yields no replayable sessions.
  token_hash CHAR(64) NOT NULL UNIQUE,
  -- Recorded so a future "your devices" view can name a session. Never trusted
  -- for anything: it is a client-supplied string.
  user_agent VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Touched on use, so an active admin rolls forward instead of being signed out
  -- on a fixed schedule regardless of activity.
  last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  INDEX idx_admin_sessions_admin (admin_id, expires_at),
  INDEX idx_admin_sessions_expiry (expires_at),
  -- Deleting or (more usually) revoking an admin really does end their sessions.
  CONSTRAINT fk_admin_sessions_admin
    FOREIGN KEY (admin_id) REFERENCES admin_users(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- LOCKOUT, IN THE DATABASE
--
-- `lib/rate-limit.ts` is a per-process in-memory bucket that documents itself as
-- a speed bump: it resets on deploy, and on more than one Node process it is one
-- bucket per process. That is fine as a supplementary per-IP guard and wrong as
-- the only thing standing between an attacker and an admin password.
--
-- So the real cap lives here, on the account, and is incremented atomically the
-- way the OTP attempt cap is — a single UPDATE whose WHERE clause is the guard,
-- never a read-then-write that two concurrent login attempts can both win. See
-- lib/admin/session.ts for the statement and the load-bearing clause order.
--
--   failed_attempts  consecutive failures since the last success; reset to 0 on
--                    any successful sign-in.
--   locked_until     when set to a future time, every sign-in is refused before
--                    the password is even hashed. NULL means not locked.

ALTER TABLE admin_users
  ADD COLUMN failed_attempts INT NOT NULL DEFAULT 0 AFTER is_active,
  ADD COLUMN locked_until DATETIME NULL AFTER failed_attempts;
