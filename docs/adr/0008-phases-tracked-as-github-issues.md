# 8. Phases are tracked as GitHub issues, synced by commit message

Date: 2026-08-08

## Status

Accepted

## Context

The rebuild is large and the owner needs to see progress without reading a
commit log. We want development broken into phases, each independently
shippable, with progress visible on GitHub.

The obvious failure mode is well known: a tracker that has to be updated by
hand drifts from reality within a week, and once it has drifted nobody trusts
it, so nobody updates it, and it becomes a second source of truth that is
always wrong.

## Decision

Phases are **milestones**. Shippable units of work are **issues**. Progress is
whatever GitHub computes from them — we never write a percentage down.

The sync is mechanical, not a discipline:

- A commit that finishes an issue says `Closes #12` in its footer. GitHub
  closes the issue when that commit lands on the default branch. Since this
  repo commits directly to main (no PR flow), this works without ceremony.
- `Refs #12` marks progress on an issue without closing it.
- Milestone percentage is therefore a side effect of committing, not a
  separate act of bookkeeping.

The roadmap itself is **code**: `scripts/roadmap.mjs` is the single source of
truth for phases, labels and issues, and `scripts/sync-github.mjs` applies it
idempotently. Reviewing the plan is reviewing a diff, and re-running the sync
after an edit updates GitHub rather than duplicating it.

Issues are matched by a hidden marker in their body (`<!-- roadmap:id -->`),
not by title, so a retitled issue is still recognised.

## Consequences

- The plan is versioned, reviewable and reproducible. A new clone can recreate
  the entire tracker with one command.
- The sync **never closes or deletes** an issue. Closing is something a commit
  or a human does; a script that closes issues would eventually close one that
  was still open for a reason.
- Commit messages become load-bearing. `commitlint` therefore runs on pushes to
  main, not only on pull requests, which it previously did — meaning the
  convention had never actually been enforced on the workflow this repo uses.
- Issues for far-future phases are deliberately **not** written. Detailed
  tickets are created for the current and next phase only; later phases carry a
  milestone and an epic. Backlogs written months ahead rot, and rewriting them
  costs more than writing them late.
- The sync requires `gh` to be authenticated. It is a developer tool, not part
  of CI: nothing in the build depends on it.
