# Family Data Core v1 - Protected PostgreSQL Preflight Contract

API Developers.digital | 2026-10-11  
Status: dry-run-first contract, no production authorization.

This block prepares a protected preflight contract for a future private PostgreSQL runtime check.

It does not connect to PostgreSQL, acquire a client, execute SQL, read credentials, mutate schema, deploy runtime code, register MCP live tools, or ingest Bistek data.

## Purpose

Create an auditable gate before any real private PostgreSQL probe.

The contract separates:

- dry-run planning;
- explicit runtime readiness checks;
- explicit confirmation requirement for live-probe mode;
- operator-level block that prevents a real probe from being executed by this PR.

## File added

- `apps/api-gateway/src/family-data-postgres-protected-preflight.mjs`

## Test added

- `tests/family-data-postgres-protected-preflight.test.mjs`

## Required gates

The plan can report `ready: true` only when the required gates are satisfied.

| Check | Requirement |
|---|---|
| `preflight_enabled` | `FAMILY_DATA_POSTGRES_PREFLIGHT_ENABLED=true` or `FAMILY_DATA_GATEWAY_BINDING_ENABLED=true` |
| `postgres_runtime_confirmed` | `FAMILY_DATA_POSTGRES_RUNTIME_CONFIRMED=FAMILY_DATA_PRIVATE_POSTGRES_CONFIRMED` |
| `tenant_supported` | tenant is `homosapiens-id` |
| `household_configured` | household id is present |
| `schema_configured` | schema is present |
| `pool_present` | an external pool object is injected |
| `pool_query_present` | the injected pool exposes `query()` |
| `pool_connect_present` | the injected pool exposes `connect()` |
| `authorize_callback_present` | an authorization callback is injected |
| `live_confirmation_present` | required only in `live_probe` mode |

## Confirmation literal

Live-probe planning requires:

```txt
FAMILY_DATA_PRIVATE_POSTGRES_PREFLIGHT_APPROVED
```

This literal is a gate marker only. It is not a secret and does not grant production access by itself.

## Safety properties

The contract explicitly returns or enforces:

| Property | Value |
|---|---|
| `performs_query` | `false` |
| `acquires_client` | `false` |
| `opens_network_connection` | `false` |
| `reads_credentials` | `false` |
| `mutates_database` | `false` |
| `deploy_executed` | `false` |
| `migration_executed` | `false` |
| `ingestion_executed` | `false` |

Even with all gates and the confirmation literal present, the exported runner still throws `family_data_postgres_live_probe_blocked_by_operator_policy`.

That preserves the separation between code readiness and explicit operator approval/execution.

## Go/No-Go

| Activity | Decision |
|---|---|
| Add protected preflight planning contract | GO |
| Unit-test dry-run and blocked live-probe behavior | GO |
| Real PostgreSQL probe | NO-GO |
| Real credential use | NO-GO |
| Runtime deploy | NO-GO |
| Schema migration | NO-GO |
| Bistek ingestion | NO-GO |
| MCP live registration | NO-GO |

## Next block

Block E should expose this protected preflight as a metadata-only endpoint or attach it to the existing readiness route.

That endpoint must remain dry-run-first and must not execute a live database probe without a separate explicit approval and a runtime capable of using private PostgreSQL safely.
