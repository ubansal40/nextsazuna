# 5. No runtime multi-tenancy; one brand per deploy

- **Status:** Accepted
- **Date:** 2026-08-07

## Context

The previous application was built as a white-label template: a single
deployment served multiple brands, resolving identity per request and recoloring
the storefront at runtime from a `site_identity` record. This drove a dual-track
colour system (hex plus `-rgb`) purely so a runtime override could recolor
everything.

## Decision

**Drop runtime brand-switching.** One brand per deploy; a second brand means a
second deployment of the same codebase with different configuration.

**Keep `site_identity` as a CMS.** The admin content editors — navigation,
homepage builder, announcement bar, breadcrumbs — still read and write it. That
is content, not tenancy, and it stays.

## Consequences

- Full static generation becomes available: no per-request tenant resolution
  means pages can be prerendered and cached without a tenant cache key.
- Simpler caching, simpler image handling, simpler data layer.
- The `-rgb` token track is **retained** — not for runtime recolor, but because
  alpha compositing still needs it (`rgb(var(--x-rgb) / .12)`).
- A second brand costs a second deploy to operate. Accepted: there is one brand
  in this repository.

## Note

This must not be misread as "delete `site_identity`". Removing it would take the
admin content editors with it.
