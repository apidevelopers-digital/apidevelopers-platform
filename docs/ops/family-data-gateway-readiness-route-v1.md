# Family Data Core v1 - Gateway Readiness Route

API Developers.digital | 2026-10-11  
Status: development route, readiness metadata only, inactive-by-default binding, no production authorization.

This block wires the Family Data Gateway binding plan into an explicit Gateway readiness route.

## Route

`GET /v1/family-data/readiness`

The route returns only readiness metadata. It does not connect to PostgreSQL, acquire a client, execute SQL, read credentials, run migrations, deploy runtime code, register MCP live tools, or ingest Bistek data.

## Files added or changed

- `apps/api-gateway/src/family-data-gateway-readiness-wrapper.mjs`
- `apps/api-gateway/src/hostinger-entry.mjs`
- `tests/family-data-gateway-readiness-wrapper.test.mjs`
- `docs/ops/family-data-gateway-readiness-route-v1.md`

## Safety contract

The wrapper reports:

| Property | Value |
|---|---|
| `opens_network_connection` | `false` |
| `performs_query` | `false` |
| `reads_credentials` | `false` |
| `deploy_executed` | `false` |
| `migration_executed` | `false` |
| `ingestion_executed` | `false` |

The route delegates all unrelated requests to the existing Gateway app.

## Readiness gates

The response embeds the same binding plan introduced in the previous block. The plan can report `ready: true` only when all required gates are explicitly satisfied:

- `FAMILY_DATA_GATEWAY_BINDING_ENABLED=true`
- `FAMILY_DATA_POSTGRES_RUNTIME_CONFIRMED=FAMILY_DATA_PRIVATE_POSTGRES_CONFIRMED`
- tenant is `homosapiens-id`
- household id is configured
- schema is configured
- an external pool object is injected
- the pool exposes `query()`
- the pool exposes `connect()`
- an authorization callback is injected

Even then, this route remains metadata-only. It is not a database probe.

## Go/No-Go

| Activity | Decision |
|---|---|
| Add readiness metadata route | GO |
| Unit-test route behavior | GO |
| Attach wrapper to Hostinger Gateway composition | GO |
| Real PostgreSQL connection | NO-GO |
| Production deploy | NO-GO |
| Schema migration | NO-GO |
| Bistek ingestion | NO-GO |
| MCP live registration | NO-GO |

## Next block

Block D should add a protected preflight contract for the real private PostgreSQL runtime, still dry-run-first and requiring an explicit confirmation literal before any live probe.
