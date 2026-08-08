# 8. Customer sessions are database-backed cookies, not JWTs

- **Status:** Accepted
- **Date:** 2026-08-08

## Context

The Express storefront signs a customer in with a **30-day HS256 JWT**, returns
it in a JSON body, and the browser keeps it in `localStorage` and sends it as an
`Authorization: Bearer` header (`server/routes/customer-portal.js`,
`server/middleware/require-customer.js`).

That token carries no `jti`. There is no denylist, no session table, and
`requireCustomer` never re-reads the customer row — it verifies the signature and
trusts the claims. Three consequences follow, and all three are live:

- **Signing out does nothing.** Both implementations simply delete the key from
  `localStorage`. The token stays valid everywhere else it has been copied, for
  up to thirty days.
- **Deleting an account does nothing either**, for the same window.
- **Any XSS is a full account takeover.** That app's own audit
  (`docs/audit-2026-08-04.md`) documents three working stored-XSS primitives on
  the same origin, and its CSP allows `'unsafe-inline'` and is report-only
  outside production.

One thing it gets genuinely right, and worth keeping: the portal signs with a
secret *derived from but distinct from* the admin's, so a customer token can
never verify on an admin route even if an operator sets both env vars to the
same value.

## Decision

A session is a **row in `customer_sessions`**, named by an opaque token in an
httpOnly cookie.

- 32 bytes from `randomBytes`. Only its SHA-256 is stored, so a leaked database
  yields no usable sessions. Unsalted and un-stretched is correct here, unlike a
  password: the input is CSPRNG output, so there is no dictionary to run and
  nothing to slow down.
- Cookie is `httpOnly`, `secure` outside development, `sameSite=lax`, 30-day
  expiry to match today's behaviour, rolled forward on use at most hourly.
- **Every request re-reads the row**, so revocation is immediate. Signing out is
  a `DELETE`. `destroyAllSessions` exists for account deletion and a future
  "sign out everywhere".
- The `customers` foreign key cascades, so deleting a customer really does end
  their sessions.

The two audiences stay isolated **structurally** rather than by key derivation:
the admin, arriving next stage, gets its own table and its own cookie name. A
customer credential is not merely rejected there — it is not a thing that can be
presented. That is a stronger guarantee than the reference's, and it needs no
configuration to hold.

`lax`, not `strict`: nothing cross-site posts with this cookie, and `strict`
would drop the session when a customer follows the link in their own order
confirmation email.

## Consequences

**The whole route tree renders per request.** The root layout reads the session,
which opts every page out of prerendering. That is a real cost and it was
measured before accepting: the content pages added in stage 2 were prerendered,
and a credential-less build — which is how production builds — proved they were
already shipping with no floating WhatsApp button and an empty footer contact
column, because the layout's content-block reads returned null at build time and
were baked in. A prerendered page wearing a broken shell is not a saving. Partial
Prerendering would recover the static shell and is worth revisiting when it
leaves experimental.

**Sessions need sweeping.** `purgeExpiredSessions` exists; nothing calls it yet.
Expired rows are inert — every read filters on `expires_at > NOW()` — so this is
housekeeping, not correctness.

**A session is one more query per request.** One indexed lookup joined to one
row, on a single-node deployment. Acceptable at this shop's traffic; the first
thing to cache if it ever is not.

**No "sign out everywhere" button yet.** The capability is there; the UI is not.
