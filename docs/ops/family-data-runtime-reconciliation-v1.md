# Family Data Core v1 — runtime reconciliation report

Status: draft operational report
Date: 2026-10-11
Scope: read-only reconciliation between `main` and `deploy/hostinger-gateway-runtime`
Production authorization: not granted

## 1. Purpose

This report reconciles the current Family Data Core v1 work in `main` with the Hostinger gateway runtime branch before any real PostgreSQL connection, migration, deploy, or Bistek ingestion.

The objective is to avoid treating a packaged runtime branch as if it were a normal continuation of `main`.

## 2. Confirmed anchors

| Item | Confirmed value |
| --- | --- |
| Repository | `apidevelopers-digital/apidevelopers-platform` |
| Main branch | `main` |
| Current `main` SHA | `2a97c524faee8b29f1c6d58a3eb64a1abcb3bd87` |
| Last confirmed Family Data PR on `main` | `#717` |
| Runtime branch | `deploy/hostinger-gateway-runtime` |
| Runtime branch SHA | `3b1e2d61e94d623c18eb5de833128ea8244dc186` |
| Runtime `SOURCE_SHA` | `5559826bbe501dc73c02ea3fdbe8350cb93b77f8` |
| Runtime ZIP bytes | `652255` |
| Runtime ZIP SHA-256 | `e800ce7c97f05882f33ef8ecebb5e46659071730c5729e4d5ab76394ed004948` |

## 3. Confirmed branch relationship

A direct GitHub comparison between `deploy/hostinger-gateway-runtime` and `main` returned no common ancestor.

Confirmed interpretation:

- `deploy/hostinger-gateway-runtime` must not be treated as an ordinary development branch behind or ahead of `main`.
- It appears to be a packaged runtime/release branch, containing runtime artifacts rather than the normal platform source tree.
- The branch contains `api-gateway-runtime.zip`, runtime metadata files, `src`, `vendor`, `package.json`, `package-lock.json`, and `release-manifest.json`.

Operational consequence:

- The hosted gateway runtime cannot be assumed to include the current Family Data Core v1 code from `main`.
- Any deploy plan must explicitly rebuild or regenerate the runtime from an approved source SHA after the PostgreSQL private runtime gate is satisfied.

## 4. Runtime source age

The runtime branch declares this source commit:

`5559826bbe501dc73c02ea3fdbe8350cb93b77f8`

That commit is `Merge PR #687: fix: preserve Mitra analyze upstream status`.

Therefore, the current runtime package is anchored before the Family Data Core v1 chain that later advanced through PRs `#700` to `#717`.

Confirmed consequence:

- The runtime package is not evidence that Family Data Core v1 is deployed.
- The runtime package is not evidence that PostgreSQL connectivity, schema checks, column checks, or private runtime activation exist in the live gateway.
- The runtime package is not evidence of Bistek ingestion.

## 5. Family Data Core status in `main`

The current `main` has advanced through the Family Data Core v1 gate sequence, including:

- initial structure, contracts, and PostgreSQL read-only query path;
- HTTP limits and inactive gateway binding;
- private runtime activation gates;
- PostgreSQL connectivity preflight;
- schema existence readiness;
- column/type readiness;
- safe PostgreSQL identifier validation;
- documented private PostgreSQL runtime activation gate.

Confirmed limitation:

- These changes prove source-level readiness and testable scaffolding.
- They do not prove a real private PostgreSQL database exists.
- They do not prove the gateway runtime currently executes this code.
- They do not prove deployment, migrations, backup/restore, observability, or end-to-end operation.

## 6. PostgreSQL infrastructure status

Confirmed from the current operational review:

- A Hostinger VPS exists and is running Ubuntu 24.04.
- Docker Manager inspection is not available for that VPS because the installed operating system does not support Docker Manager.
- Hosted database inventory available through Hostinger showed databases on port `3306`, compatible with MySQL/MariaDB.
- No PostgreSQL private database was confirmed.
- No PostgreSQL TLS posture, restricted network path, role separation, backup/restore, or observability was confirmed.

Operational consequence:

- The correct current state is `NO-GO` for real PostgreSQL connection, migration, deploy, or ingestion.

## 7. GO/NO-GO matrix

| Gate | Status | Reason |
| --- | --- | --- |
| Source reconciliation | GO | Read-only review only |
| Runtime branch classification | GO | Branch is packaged runtime, not normal source branch |
| Runtime deploy | NO-GO | Runtime source predates Family Data Core v1 PR chain |
| PostgreSQL connection | NO-GO | Private PostgreSQL not confirmed |
| PostgreSQL migrations | NO-GO | Database, roles, backups, and network not confirmed |
| Bistek ingestion | NO-GO | Ingestion remains unauthorized and database unavailable |
| Merge to `main` | NO-GO without separate review | This report is documentation only |
| PR #702 reuse | NO-GO for automatic reuse | Draft and dirty; use only as historical reference |

## 8. Required next block

Block B should not start by deploying or ingesting data.

Recommended next block:

`family-data-runtime-readiness-bundle-v1`

Scope:

1. Add a source-level runtime readiness document/checklist that maps the current `main` Family Data Core files to the required runtime package contents.
2. Add or update a safe script/test that can validate, without secrets and without network side effects, whether the runtime bundle includes the expected Family Data Core modules and gates.
3. Keep PostgreSQL real connection behind explicit approval.
4. Keep deployment and ingestion out of scope.

## 9. Approval gates still required

Separate explicit approval is required before any of the following:

- connecting to a real private PostgreSQL instance;
- applying migrations;
- writing to production;
- deploying a rebuilt gateway runtime;
- ingesting Bistek data;
- exposing any family data projection;
- merging a deploy/runtime branch;
- altering infrastructure.

## 10. Final operational conclusion

Confirmed:

- `main` contains the current Family Data Core v1 source-level gate work.
- `deploy/hostinger-gateway-runtime` is a packaged runtime branch whose declared source SHA predates the Family Data Core v1 PR chain.
- PostgreSQL private infrastructure is still not proven.

Inferred:

- The live/runtime gateway is likely behind the Family Data Core v1 source state unless rebuilt from a newer approved source SHA.
- The next useful development should improve runtime readiness verification rather than adding more unchecked product surface.

Blocked:

- Real PostgreSQL connection, deploy, migrations, ingestion, and end-to-end production claim.
