# 7. Preserve the `/jewellery/{slug}.html` canonical URLs

- **Status:** Accepted
- **Date:** 2026-08-07

## Context

The Express storefront serves every catalog page from a single canonical URL
shape: `/jewellery/{slug}.html`, covering categories, tags, collections and
products. Those URLs are indexed and carry the site's accumulated search
ranking.

A rebuild is the obvious moment to modernise them to `/jewellery/{slug}` or a
richer scheme like `/rings/solitaire-halo-ring`. Every such change costs
redirects, a recrawl period during which rankings move, and the risk that a URL
missed in the mapping becomes a dead page.

## Decision

**Keep the existing URLs byte-for-byte**, including the `.html` suffix.

The Next.js route is `app/jewellery/[slug]/page.tsx`. The dynamic segment simply
arrives as `"solitaire-halo-ring.html"` and the suffix is stripped in
`slugFromSegment`. No rewrites, no redirects, no middleware.

`slugFromSegment` returns null when the suffix is absent, so `/jewellery/foo`
404s rather than serving the same content at a second address. One canonical URL
per page; identical content at two URLs splits ranking between them.

### Resolution order is part of this decision

The dispatcher resolves a slug in a fixed order: **category → tag → collection →
product**, first match wins. Ported exactly from the Express implementation.

Nothing in the schema enforces slug uniqueness across those four tables. It
holds in the current data — verified, zero collisions — but an admin can create
a tag tomorrow whose slug matches a product. The order is what decides which
page a customer lands on, so it is behaviour, not an implementation detail.

## Consequences

- Zero SEO risk from the migration. No redirect map to maintain, no recrawl
  window, no ranking to recover.
- The `.html` suffix is cosmetically dated. It is invisible to customers and
  costs nothing technically; trading real traffic for that is a bad exchange.
- Reordering the slug resolution to "optimise" (for instance putting products
  first, being the largest table) silently changes which page a colliding slug
  serves. Do not.
- If the URLs are ever modernised, it should be a deliberate project with a
  complete redirect map — not a side effect of a rendering change.
