# Family Data Core v1 - Runtime Reconciliation Report

API Developers.digital | 2026-10-11
Status: read-only reconciliation, no production authorization.

No merge, deploy, database connection, migration, ingestion, or production write is authorized or implied by this report.

## Purpose

Reconcile the `deploy/hostinger-gateway-runtime` branch with the current `main` branch before continuing Family Data Core v1 runtime work in larger functional blocks.

## Confirmed evidence

| Item | Value |
|---|---|
| Repository | `apidevelopers-digital/apidevelopers-platform` |
| Primary branch | `main` |
| Current `main` SHA | `2a97c524faee8b29f1c6d58a3eb64a1abcb3bd87` |
| Runtime branch | `deploy/hostinger-gateway-runtime` |
| Runtime branch SHA | `3b1e2d61e94d623c18eb5de833128ea8244dc186` |
| Runtime `SOURCE_SHA` | `5559826bbe501dc73c02ea3fdbe8350cb93b77f8` |
| Runtime format | `managed-node-zip` |
| Runtime service | `api-gateway` |
| Runtime version | `0.8.0` |
| Entrypoint | `src/hostinger-entry.mjs` |
| Start command | `npm start` |
| Expected port | `3000` |

## Critical finding

The runtime branch is not a normal development branch comparable to `main`. It contains a runtime zip artifact, source SHA metadata, a release manifest, `src`, and `vendor` directories.

A direct GitHub comparison between `deploy/hostinger-gateway-runtime...main` failed with `No common ancestor`.

## Interpretation

| Classification | Statement |
|---|---|
| Confirmed | The runtime branch is a packaged deploy artifact with `SOURCE_SHA` and `release-manifest.json` metadata. |
| Confirmed | The runtime `SOURCE_SHA` is `5559826...`, not the current `main` SHA `2a97c52...`. |
| Inferred | The runtime artifact predates the current Family Data Core v1 gates and should not be treated as equivalent to `main`. |
| Pending | Exact source diff from packaged runtime to current `apps/api-gateway`, if needed. |
| Blocked | Any real production update until a private PostgreSQL environment is confirmed and separately approved. |

## Family Data Core implication

The `main` branch contains the recent Family Data Core v1 gates and PostgreSQL readiness work consolidated through PRs #708-#717.

The runtime branch does not prove that those current Family Data Core changes are present in any deployed Gateway instance. It proves only that a packaged `api-gateway` artifact exists.

## Runtime artifact contents

The runtime branch includes:

- `RUNTIME_ZIP_BYTES`
- `RUNTIME_ZIP_SHA256`
- `SOURCE_SHA`
- `api-gateway-runtime.zip`
- `package.json`
- `package-lock.json`
- `release-manifest.json`
- `src/`
- `vendor/`

The `release-manifest.json` describes a Node runtime for `api-gateway`. It does not complete, by itself, a Family Data Core production readiness check.

## Gaps for Gateway -> Family Data Core production readiness

1. Confirm whether a new runtime artifact was or must be built from `2a97c524faee8b29f1c6d58a3eb64a1abcb3bd87`.
2. Confirm a private PostgreSQL environment without exposing secrets.
3. Confirm TLS, network restriction, backup/restore, and observability.
4. Confirm separate roles for migration and read-only query.
5. Confirm Gateway environment variables and readiness gates.
6. Confirm MCP Brain registration and authorized scopes.
7. Perform probes only after explicit approval.

## Go/No-Go

| Activity | Decision | Reason |
|---|---|---|
| Read-only documentation | GO | Safe and non-production. |
| Reconcile build inputs | GO | Required to avoid deploying old runtime. |
| Build new runtime artifact from current `main` | GO, gated | Only as controlled build/preview, not deploy. |
| Real PostgreSQL connection | NO-GO | Requires separate approval and adequate private database. |
| Production migrations | NO-GO | Requires approval, rollback, and backup proof. |
| Deploy | NO-GO | Runtime is not proven to contain current Family Data Core v1 work. |
| Bistek ingestion | NO-GO | Requires approved private infrastructure first. |

## Next priority

Block B: prepare an inactive-by-default development plan for the Gateway/Service Hub binding that can consume Family Data Core v1 only after the private PostgreSQL runtime gate is satisfied.

This is not authorization for any real database connection or deploy.

## Approvals required later

- Production PostgreSQL connection.
- Read-only probes against real private database.
- Schema/migrations.
- Gateway runtime publication.
- MCP Brain live registration.
- Bistek data ingestion.
