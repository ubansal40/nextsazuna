-- 0018_coupon_per_customer_limit.sql
--
-- A per-customer cap on coupon redemptions.
--
-- `max_uses` caps a code across the whole shop, which is the wrong control for
-- a welcome offer: WELCOME1000 is meant to be one use *each*, not 500 uses
-- claimed by one person. The reference admin's coupon form has had this field
-- for years; nothing ever stored it.
--
-- Nullable, so every existing coupon keeps its current meaning — blank is
-- unlimited, exactly as blank `max_uses` already is.
--
-- The index is what makes enforcing it affordable. Counting a customer's prior
-- redemptions means `WHERE coupon_code = ?` over `orders`, which has no index
-- on that column today: it was added in 0002 as a denormalised snapshot for
-- display, and nothing has ever filtered on it. Without this, every checkout
-- carrying a limited code would full-scan the orders table.

ALTER TABLE coupons
  ADD COLUMN per_customer_limit INT UNSIGNED NULL AFTER max_uses;

ALTER TABLE orders
  ADD INDEX idx_orders_coupon (coupon_code);
