-- 0013_order_statuses_and_activity.sql
--
-- Configurable order statuses, order soft-delete, and the activity feed.
--
-- `orders.status` was an ENUM, so adding a workflow step ("Awaiting stone
-- setting") meant a schema change. It becomes a VARCHAR referencing
-- `order_statuses`, which the admin manages: label, colour, order, whether the
-- customer sees it on their timeline, and which one new orders get.
--
-- The eight seeded rows are exactly the old ENUM values, keeping their keys, so
-- every existing order and every code path that writes a literal status
-- ('placed' at checkout, 'payment_failed' from a gateway callback) keeps working
-- untouched. `is_system` marks them undeletable: they carry side-effects the
-- platform relies on.
--
-- **`customer_visible` is NOT the order-lookup gate.** Whether a guest can find
-- an order at all stays in code (`HIDDEN_ORDER_STATUSES` in lib/order-lookup.ts)
-- because it is an enumeration boundary, and an admin toggling a switch must not
-- be able to expose gateway-incomplete orders. This column only decides whether
-- a status draws as a step on the customer's timeline.
--
-- Internal notes keep using the existing `order_notes` table, which already has
-- the right shape and live rows; `order_activity` records system events. The
-- order detail merges the two by timestamp into one feed.

CREATE TABLE IF NOT EXISTS order_statuses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  -- Matches the old ENUM values. Written by checkout and the payment callbacks,
  -- so it is immutable once created; the admin renames `label`, never this.
  `key` VARCHAR(60) NOT NULL UNIQUE,
  label VARCHAR(80) NOT NULL,
  -- A palette token name ('gold', 'green', 'red', …), never a hex literal:
  -- CLAUDE.md forbids a component hardcoding a value a token covers, and that
  -- holds for a value the database hands the component. globals.css resolves it.
  colour VARCHAR(24) NOT NULL DEFAULT 'muted',
  sort_order INT NOT NULL DEFAULT 0,
  -- System statuses have side-effects elsewhere in the app and cannot be
  -- deleted. Their label, colour, order and visibility are still the admin's.
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  -- Exactly one row should carry this; the data layer enforces it.
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  -- Draws as a step on the customer's order timeline.
  customer_visible TINYINT(1) NOT NULL DEFAULT 1,
  -- An end state: the timeline stops here rather than showing later steps.
  is_terminal TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_order_statuses_order (sort_order, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The current ENUM, seeded verbatim. `pending_payment`, `payment_failed` and
-- the legacy `processing` are hidden from the timeline — the first two are not
-- yet real purchases and the third no live row should carry.
INSERT IGNORE INTO order_statuses
  (`key`, label, colour, sort_order, is_system, is_default, customer_visible, is_terminal)
VALUES
  ('pending_payment', 'Pending payment', 'muted',  1, 1, 0, 0, 0),
  ('payment_failed',  'Payment failed',  'red',    2, 1, 0, 0, 1),
  ('placed',          'Placed',          'gold',   3, 1, 1, 1, 0),
  ('confirmed',       'Confirmed',       'gold',   4, 1, 0, 1, 0),
  ('billed',          'Billed',          'gold',   5, 1, 0, 1, 0),
  ('processing',      'Processing',      'muted',  6, 1, 0, 0, 0),
  ('completed',       'Completed',       'green',  7, 1, 0, 1, 1),
  ('cancelled',       'Cancelled',       'red',    8, 1, 0, 1, 1);

-- ENUM -> VARCHAR. Same values, same default, so no row changes and the
-- existing idx_orders_status (status, payment_status) keeps working.
ALTER TABLE orders
  MODIFY status VARCHAR(60) NOT NULL DEFAULT 'placed';

-- Orders are 7-year tax records: they are never hard-deleted, only hidden.
ALTER TABLE orders
  ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL AFTER updated_at,
  ADD COLUMN cancel_reason VARCHAR(120) NULL AFTER deleted_at,
  ADD INDEX idx_orders_deleted (deleted_at);

CREATE TABLE IF NOT EXISTS order_activity (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  -- Null actor = the system (a gateway callback, not a person).
  admin_id INT NULL,
  admin_email VARCHAR(190) NULL,
  -- 'status' | 'edit' | 'notify' | 'cancel' | 'restore'
  event_type VARCHAR(40) NOT NULL,
  from_status VARCHAR(60) NULL,
  to_status VARCHAR(60) NULL,
  message VARCHAR(500) NULL,
  -- The before/after of an edit, for the detail's activity feed.
  diff_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_order_activity_order (order_id, created_at),
  CONSTRAINT fk_order_activity_order FOREIGN KEY (order_id) REFERENCES orders(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
