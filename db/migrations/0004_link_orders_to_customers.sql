-- 0004_link_orders_to_customers.sql
--
-- Backfill `orders.customer_id`, which has existed since 0001 and has never
-- been written.
--
-- `createOrder` inserted every column except that one, so every order this app
-- has taken is unattached. The Express app has the same hole and papers over it
-- from the admin side: `customer_id` is only filled in when staff move an order
-- to billed. Two things follow, and both are visible to a customer:
--
--   * There is no self-registration anywhere — an account exists because an
--     order created one. With nothing creating them, a real paying customer is
--     told "no account found" when they try to sign in.
--   * Order history reads `WHERE customer_id = ?`, so even once an account
--     appears, everything bought before it is silently missing.
--
-- lib/customers.ts now links at checkout. This attaches the orders already
-- taken, so the account portal is right for existing customers on day one
-- rather than only for people who buy again.
--
-- Phone is the identity, stored bare and 10 digits. RIGHT(digits, 10) is the
-- SQL equivalent of normalisePhone() in lib/order-lookup.ts for every realistic
-- input: a +977 prefix, a national trunk 0, and spaces or dashes all fall away
-- once non-digits are stripped and the last ten are taken. Rows whose phone
-- cannot make ten digits are left unlinked rather than guessed at.

-- ---------------------------------------------------------------------------
-- 1. An account for every order phone that does not have one.
--    INSERT IGNORE against the UNIQUE phone means the first row per number
--    wins, and DESC order makes that the most recent order — the freshest name
--    and email we hold. Empty strings become NULL so a blank never looks like
--    a value the customer supplied.
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO customers (phone, name, email)
SELECT RIGHT(REGEXP_REPLACE(o.phone, '[^0-9]', ''), 10) AS phone,
       NULLIF(TRIM(o.customer_name), '') AS name,
       NULLIF(TRIM(o.email), '') AS email
  FROM orders o
 WHERE CHAR_LENGTH(RIGHT(REGEXP_REPLACE(o.phone, '[^0-9]', ''), 10)) = 10
 ORDER BY o.id DESC;

-- ---------------------------------------------------------------------------
-- 2. Attach the orders. Only rows that are still unattached — an order an
--    admin already linked keeps the customer they chose.
-- ---------------------------------------------------------------------------
UPDATE orders o
  JOIN customers c
    ON c.phone = RIGHT(REGEXP_REPLACE(o.phone, '[^0-9]', ''), 10)
   SET o.customer_id = c.id
 WHERE o.customer_id IS NULL;
