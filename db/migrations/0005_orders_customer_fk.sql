-- 0005_orders_customer_fk.sql
--
-- Give `orders.customer_id` a real foreign key.
--
-- 0001 created the column and its index but no constraint, and the Express app
-- is the same. `loyalty_ledger` next to it *does* declare a cascading FK, so a
-- deleted customer takes their points history with them but leaves their orders
-- pointing at an id that no longer exists. A restore or a reseed that reuses
-- that id silently reattaches a stranger's purchases to the new owner.
--
-- ON DELETE SET NULL, not CASCADE. Orders are tax records — Nepal requires
-- seven years of them, which is what /privacy and /account-deletion both tell
-- customers. Deleting a person must never delete what they bought; it unlinks
-- it. That is also exactly what an account-deletion request should do.
--
-- Safe to add now: 0004 linked every existing order to a real row, so there are
-- no orphans for the constraint to trip over.

ALTER TABLE orders
  ADD CONSTRAINT fk_orders_customer
  FOREIGN KEY (customer_id) REFERENCES customers(id)
  ON DELETE SET NULL ON UPDATE CASCADE;
