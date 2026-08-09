# 9. The admin is a route group with its own session model

- **Status:** Accepted
- **Date:** 2026-08-09

## Context

The admin console and the storefront live in one Next application and one
deployment. They share a database, a design system and a build, but almost
nothing else: the storefront is anonymous-first and cached, the admin is
authenticated-only and never cached; the storefront's identity is a customer
with an OTP, the admin's is a staff member with a password and a role.

Two things had to be decided before the first admin screen: how the two halves
are kept apart in the routing tree, and whether staff reuse the customer session.

## Decision

**A route group, not a subdomain or a separate app.** `app/(admin)/admin/*`
holds the console; `app/(storefront)/*` holds the shop. The storefront's header,
footer, announcement bar and cart providers are mounted in the storefront
group's layout rather than the root, so an admin page cannot accidentally render
a shopping cart, and a storefront page cannot render the admin shell.

Inside the admin, a second nesting — `admin/(authed)/*` — carries the guard, so
the login page can live at `/admin/login` outside it. The `(authed)` layout
calls `requireAdmin()`.

**Staff sessions are separate from customer sessions**, in their own table with
their own cookie (`sazuna_admin`), following the model ADR 0008 set for
customers: an opaque token in an HttpOnly cookie, the record re-read from the
database on every request.

**A layout guard is not the authorization boundary.** Every Route Handler and
every Server Action calls `requireSection(key)` for itself. A layout runs before
a *page*; it does not run before a Server Action invoked from a page that is
already open. Treating the layout as the gate would leave every mutation
unprotected.

## Consequences

- Signing out of the shop does not sign you out of the admin, and vice versa.
  This is the point: a shared machine at the counter should not hand a customer
  the console because a staff member forgot to log out of the storefront.
- Deactivating a staff member ends their access on the next request, because
  the session row is re-read rather than trusted from a signed payload.
- `requireSection` appears in every action and handler, which reads as
  repetitive. It is deliberate repetition: the alternative is a single guard
  someone forgets to extend, and deny-by-default only works if the default is
  actually reached.
- The two route groups can diverge in caching. Storefront pages may be static or
  revalidated; admin pages are dynamic by construction.
