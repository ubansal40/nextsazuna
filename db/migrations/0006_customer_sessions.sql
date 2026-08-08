-- 0006_customer_sessions.sql
--
-- Sign-in sessions for the customer portal.
--
-- The Express app issues a 30-day HS256 JWT, hands it to the browser in a JSON
-- body, and the client keeps it in localStorage and sends it as a Bearer
-- header. There is no `jti`, no denylist and no server-side re-read, so logout,
-- "sign out everywhere" and account deletion are all cosmetic for up to thirty
-- days — and that app's own audit documents three stored-XSS primitives on the
-- same origin, any of which lifts the token straight out of localStorage.
--
-- This table is what replaces that. The cookie carries an opaque random token
-- and nothing else; the row is the session. Revocation is a DELETE, which means
-- it actually happens.
--
-- Only the SHA-256 of the token is stored, never the token. A leaked database
-- therefore cannot be replayed as a set of live sessions. Unsalted and
-- un-stretched is right here, unlike a password: the input is 32 bytes of
-- CSPRNG output, so there is no dictionary to run and nothing to slow down.

CREATE TABLE IF NOT EXISTS customer_sessions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  -- Hex SHA-256 of the cookie value. UNIQUE so a lookup is one index hit and a
  -- duplicate token is impossible rather than merely unlikely.
  token_hash CHAR(64) NOT NULL UNIQUE,
  -- Recorded so a future "your devices" view can name a session. Never trusted
  -- for anything: it is a client-supplied string.
  user_agent VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Touched on use, so an active session can roll forward without the customer
  -- being signed out every thirty days regardless of activity.
  last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  INDEX idx_customer_sessions_customer (customer_id, expires_at),
  INDEX idx_customer_sessions_expiry (expires_at),
  -- Deleting a customer really does end their sessions.
  CONSTRAINT fk_customer_sessions_customer
    FOREIGN KEY (customer_id) REFERENCES customers(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
