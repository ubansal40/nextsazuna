# 4. Design tokens are checked against the spec, not maintained by hand

- **Status:** Accepted
- **Date:** 2026-08-07

## Context

The previous storefront had a design system that *nearly* matched its
specification. Comparing the two revealed it missed on **every single value**:

| Role | Previous CSS | Ceremony spec |
|---|---|---|
| Primary CTA | `#84292B` | `#7A2226` |
| Primary hover | `#6B2122` | `#5B1A1E` |
| Canvas | `#FAF6EF` | `#FBF8F3` |
| Surface | `#F2EBDE` | `#F3ECE0` |
| Line | `#E8DFCB` | `#E6DCC9` |
| Muted | `#766C5A` | `#6E6559` |
| Heading | `#1A1614` | `#191512` |
| Gold | `#B69253` | `#C9A15A` |

It also shipped 58 font files across 8 families where the spec permits 3.

No individual difference was large enough for anyone to notice. That is exactly
why it happened: hand-maintained tokens drift silently, and "follow the design
system" as a convention does not survive months of small edits.

## Decision

1. Tokens use the spec's own names (`--sz-*`) and values, transcribed verbatim
   into `app/globals.css`.
2. `design-spec/ceremony-tokens.css` holds an offline copy of the spec's `:root`
   block.
3. `scripts/check-tokens.mjs` diffs the two and **fails the build** on any
   mismatch. It runs in CI ahead of typecheck, lint and build.
4. Tailwind utilities are bridged with `@theme inline`, so a utility emits a
   reference to the custom property rather than a copy of its value.

## Consequences

- Design-system adherence is mechanically enforced, not promised.
- Adopting the spec's `--sz-*` names removes any translation layer between the
  design source of truth and the code — a spec change is a copy, not a mapping.
- The fixture must be **re-exported** when the spec changes. Hand-patching it to
  make a red build go green defeats the entire mechanism.
- Component tokens the spec's own components need but its `:root` does not name
  (13/15px text, 7/8/9px radii, 42/44px control heights) live in a separate,
  clearly-labelled block. The checker permits these as extensions but still
  requires every canonical token to match exactly.
