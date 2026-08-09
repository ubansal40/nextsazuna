-- 0014_pricing_rule_weight_ranges.sql
--
-- Weight-range conditions on pricing rules.
--
-- A rule could previously match only on material, purity and category, so
-- "18KT diamond, light band" and "18KT diamond, heavy band" could not be
-- separate rules — the two would collide on identical attributes and the first
-- by priority would always win. These four optional ranges are what let a rule
-- narrow to a band of weights.
--
-- Every bound is nullable and independent: both blank ignores that weight, one
-- side blank means "over" or "under". DECIMAL(10,3) matches the precision the
-- weights already carry on `order_items` and `products`.
--
-- Additive and null-defaulted, so every existing rule keeps matching exactly
-- what it matched before this ran.

ALTER TABLE pricing_rules
  ADD COLUMN gross_weight_min   DECIMAL(10,3) NULL AFTER category_id,
  ADD COLUMN gross_weight_max   DECIMAL(10,3) NULL AFTER gross_weight_min,
  ADD COLUMN net_weight_min     DECIMAL(10,3) NULL AFTER gross_weight_max,
  ADD COLUMN net_weight_max     DECIMAL(10,3) NULL AFTER net_weight_min,
  ADD COLUMN diamond_weight_min DECIMAL(10,3) NULL AFTER net_weight_max,
  ADD COLUMN diamond_weight_max DECIMAL(10,3) NULL AFTER diamond_weight_min,
  ADD COLUMN stone_weight_min   DECIMAL(10,3) NULL AFTER diamond_weight_max,
  ADD COLUMN stone_weight_max   DECIMAL(10,3) NULL AFTER stone_weight_min;

-- Rules are evaluated in priority order and the first match wins, so the list
-- is read sorted on every save and every product price derivation.
ALTER TABLE pricing_rules
  ADD INDEX idx_pricing_rules_priority (is_active, priority, id);
