# Platform Open PR Lifecycle — 2026-08-08

**Repository:** `apidevelopers-digital/apidevelopers-platform`  
**Canonical base:** `main` at `c906953ceab603f7fa898a4788853c7edc1064c8`

## Rule

An open PR is not current authority merely because it exists. Every old PR must be reanchored against current `main`, current institutional authority and current product direction before reuse or merge.

## Open PR inventory

11 open PRs were enumerated.

| PR | Topic | Classification |
|---:|---|---|
| #106 | Petra Advocacia GitHub/Hostinger actions | parallel client-specific candidate |
| #104 | Hostinger executor API diagnostics | historical/parallel; predates current Site Factory monitor fix |
| #41 | kernel-decision tenant-bound advisory decision | historical technical candidate; requires fresh reanchor |
| #33 | PostgreSQL observability and alerts | historical technical candidate; requires fresh reanchor |
| #15 | API Gateway foundation promotion | historical/superseded foundation candidate |
| #13 | operator reanchor evidence | historical continuity/operations proposal |
| #12 | portal learning operational policy | historical operational proposal |
| #4 | six-chat workstream registry | historical coordination model |
| #3 | chat continuity reanchor | historical continuity model |
| #2 | Portal Projector runtime E2E | historical technical candidate |
| #1 | global platform foundation consolidation | superseded foundation umbrella |

## Current active platform front

The active platform front is the post-institutional reanchor on current `main`.

The first concrete gap, `Site Factory Hostinger Node Contract Monitor`, was repaired and merged through PR #155.

The next active axis is repository security hardening plus selective reconciliation of useful technical work from older PRs.

## Reuse rule

Before reusing any open PR:

1. compare it with current `main`;
2. identify duplicate or already-merged capabilities;
3. identify authority or naming conflicts;
4. extract only unique useful material;
5. rebuild on a fresh branch when necessary;
6. run current CI;
7. merge only after explicit approval.

No PR closure, branch deletion or destructive cleanup is authorized by this classification.
