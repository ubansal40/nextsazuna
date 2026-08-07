-- 0002_coupons_and_order_discounts.sql
--
-- Adds the coupons table and the four order discount columns.
--
-- WHY THIS IS SEPARATE FROM 0001
--
-- 0001 was generated from the Express application's boot-time DDL, which is the
-- only schema definition that lives in its code. Coupons were never added there:
-- they shipped as standalone SQL files applied by hand
-- (sql/migrations/2026-05-15_coupons.sql and _coupons_free_shipping.sql), so the
-- boot path never knew about them and neither did the trace 0001 came from.
--
-- The gap was found by diffing the live database against 0001 rather than by
-- reading the code — which is the whole reason that reconciliation step exists.
-- Without this migration, coupon redemption and order discounts would fail
-- against a database built purely from 0001.
--
-- Definitions below are taken verbatim from SHOW CREATE TABLE on production
-- (u721828376_sazunav2), including column order, so a database built from these
-- migrations is structurally identical to the live one.

-- ============================================================================
-- COUPONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS coupons (
  id              INT(11)                        NOT NULL AUTO_INCREMENT,
  code            VARCHAR(50)                    NOT NULL,
  discount_type   ENUM('percent','fixed')        NOT NULL DEFAULT 'percent',
  discount_value  DECIMAL(10,2)                  NOT NULL DEFAULT 0.00,
  min_subtotal    DECIMAL(12,2)                  NOT NULL DEFAULT 0.00,
  max_discount    DECIMAL(12,2)                      NULL DEFAULT NULL,
  free_shipping   TINYINT(1)                     NOT NULL DEFAULT 0,
  starts_at       DATETIME                           NULL DEFAULT NULL,
  expires_at      DATETIME                           NULL DEFAULT NULL,
  max_uses        INT(10) UNSIGNED                   NULL DEFAULT NULL,
  used_count      INT(10) UNSIGNED               NOT NULL DEFAULT 0,
  is_active       TINYINT(1)                     NOT NULL DEFAULT 1,
  description     VARCHAR(255)                       NULL DEFAULT NULL,
  created_by      VARCHAR(255)                       NULL DEFAULT NULL,
  created_at      TIMESTAMP                      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP                      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_code (code),
  KEY idx_active_window (is_active, starts_at, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- ORDER DISCOUNT COLUMNS
-- Money stays DECIMAL and is read back as a string; see ADR 0003.
-- ============================================================================

ALTER TABLE orders ADD COLUMN coupon_code VARCHAR(50) NULL DEFAULT NULL AFTER note;
ALTER TABLE orders ADD COLUMN discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER coupon_code;
ALTER TABLE orders ADD COLUMN loyalty_points_redeemed INT(11) NOT NULL DEFAULT 0 AFTER discount_amount;
ALTER TABLE orders ADD COLUMN loyalty_discount_npr DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER loyalty_points_redeemed;
