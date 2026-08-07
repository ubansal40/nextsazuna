# 2. Rebuild as a Next.js fullstack application

- **Status:** Accepted
- **Date:** 2026-08-07

## Context

The existing storefront is Express + MariaDB: ~19,700 lines of server code across
23 route files, ~110 API endpoints, 58 HTML pages (21 storefront, 37 admin),
vanilla JS islands and a prebuilt Tailwind v3 stylesheet.

It works. Its weaknesses are structural rather than functional: rendering was
hand-rolled server-side, the frontend has no component model, and the design
system had drifted from its own specification on every single colour value.

The owner decided to move to Next.js fullstack. Scope was set deliberately to
**everything** — storefront and admin — rather than storefront only.

## Decision

Rebuild as a single Next.js 16 App Router application, absorbing the API into
route handlers and Server Actions rather than keeping Express as a separate
backend.

Migration proceeds as **vertical slices**: each phase ends with a working,
deployable application, starting with the design system foundation.

## Consequences

- One codebase, one deploy, one language across the stack.
- **The whole ~110-endpoint API is rewritten**, including payment, pricing,
  coupon and loyalty paths. These are the highest-risk code paths in the
  business and they get no functional improvement from the move — the benefit is
  structural. This was accepted knowingly.
- The previous app's `server/services/*` remain the reference for business
  rules; behaviour is ported, not reinvented.
- A working Express deployment stays live on a separate subdomain throughout, so
  there is always something to compare against.
