-- 0019_seed_cash_on_delivery.sql
--
-- Cash on delivery, for a database that has no payment configuration at all.
--
-- The checkout offers the methods in the `payment_methods` content block, and
-- nothing else. No migration ever created that block, and the admin cannot:
-- `lib/admin/content-keys.ts` excludes it as a type, because on a live install
-- it holds gateway secrets. So a database built from these migrations — the
-- README's own setup, a staging copy, CI — offered no way to pay, and every
-- order was refused as "That payment method isn't available right now",
-- cash on delivery included.
--
-- Seeds cash on delivery only: no gateway, no credentials, nothing to leak.
-- A database that already has the block — production, copied from the Express
-- app — is left exactly as it is.

INSERT INTO content_blocks (`key`, `value`, is_published, updated_by)
VALUES (
  'payment_methods',
  JSON_ARRAY(
    JSON_OBJECT(
      'code', 'cod',
      'label', 'Cash on Delivery',
      'description', 'Pay in cash when your order arrives.',
      'is_enabled', TRUE,
      'surcharge_percent', 0
    )
  ),
  1,
  'migration'
)
ON DUPLICATE KEY UPDATE `key` = `key`;
