# 1. Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-08-07

## Context

This project is a multi-month rebuild of a working storefront. Several
significant decisions were taken before any code was written, in conversation.
Decisions made that way get relitigated: three months in, nobody remembers
whether raw SQL was a deliberate choice or an oversight, and the discussion
restarts from zero.

## Decision

Every architecturally significant decision gets a short record in `docs/adr`,
numbered sequentially, in the format used here: Context, Decision, Consequences.

A decision is significant if reversing it would be expensive, or if a competent
newcomer would reasonably ask "why is it done this way?".

ADRs are immutable once accepted. A decision that changes gets a **new** ADR
that supersedes the old one; the old record stays, marked superseded, because
the reasoning that was true at the time is what explains the code that exists.

## Consequences

- Design review has a written history rather than a recollection.
- Slight overhead per decision — a few minutes to write.
- ADRs are the first place to look before reopening a settled question.
