# 10. Taxonomy and order statuses are tables, not enums or code

- **Status:** Accepted
- **Date:** 2026-08-09

## Context

Four vocabularies were hardcoded in one form or another: materials and purities
were free strings on `products`, tags had no grouping, and `orders.status` was a
MySQL `ENUM`. Adding "Rose Gold", grouping filters, or introducing a workflow
step like "Awaiting stone setting" all meant a developer, a migration and a
deploy — for what is, in every case, a business vocabulary the owner should
control.

## Decision

Each becomes a table the admin manages: `materials`, `purities`, `tag_groups`,
and `order_statuses`.

Two rules make this safe rather than merely flexible:

**1. The stored key is immutable; only the label moves.** `orders.status` holds
`placed`, and checkout and the payment callbacks write that literal. The admin
renames the *label* to "Order received" and every screen follows, but no code
path breaks, because the key it writes never changed. Materials and purities
work the other way — the product column holds the string itself — so a rename
rewrites the matching products in the same transaction rather than orphaning
them.

**2. System rows are undeletable.** The eight statuses seeded from the old
`ENUM` carry `is_system`. They have side-effects elsewhere in the application, so
their label, colour, order and customer visibility are the owner's, but they
cannot be removed. Deleting a *custom* status requires a reassignment target,
because an order pointing at a key with no row renders as a bare key everywhere
the label is joined.

**Presentation stays tokenised.** A status stores a palette token name
(`gold`, `green`, …), never a hex. A colour the database hands a component is
still a hardcoded value if it is a literal, and CLAUDE.md's rule against that
does not stop at the edge of the codebase.

**What is NOT configurable: the enumeration boundary.** `customer_visible` on a
status decides whether it draws as a step on the customer's timeline. It does
*not* decide whether a guest can look the order up at all — that list
(`HIDDEN_ORDER_STATUSES`) stays in code, because it protects
gateway-incomplete orders from being enumerated and a switch in a drawer is the
wrong place for a security boundary.

## Consequences

- The owner can add a workflow step without a deploy, and it appears as a quick
  tab, a dropdown option and (if they choose) a customer-visible timeline step.
- `orders.status` is a `VARCHAR` with no foreign key to `order_statuses`. The
  application enforces the relationship, which is weaker than a constraint but
  keeps a gateway callback writing a literal from failing on a race with an
  admin edit. The lists join with `LEFT JOIN` and fall back to the raw key, so a
  missing row degrades to something truthful rather than to a blank cell.
- Product counts and filters must read the tables rather than
  `SELECT DISTINCT` over product columns — the whole point is that a hidden or
  reordered vocabulary entry changes the storefront.
- Seeding from the previous `ENUM` verbatim means no data migration and no
  rewritten rows. The cost is that the seeded set carries the old names,
  including the legacy `processing`, which now sits hidden rather than being
  quietly dropped.
