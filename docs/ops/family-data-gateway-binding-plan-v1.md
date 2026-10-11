# Family Data Core v1 - Gateway Binding Plan

API Developers.digital | 2026-10-11  
Status: development plan, inactive by default, no production authorization.

This block prepares the Gateway/Service Hub binding surface for Family Data Core v1 without connecting to a real database, deploying runtime code, running migrations, or ingesting Bistek data.

## Purpose

Create a small, auditable Gateway-side planning contract that says whether the Family Data Core binding is ready to be wired at runtime.

The contract is deliberately inert. It can be imported and tested without:

- reading credentials;
- opening a network connection;
- acquiring a PostgreSQL client;
- executing SQL;
- mutating schema;
- deploying;
- ingesting data.

## File added

- `apps/api-gateway/src/family-data-gateway-binding-plan.mjs`

## Tests added

- `tests/family-data-gateway-binding-plan.test.mjs`

## Required gates

The binding plan reports `ready: true` only when all checks are satisfied:

| Check | Meaning |
|---|---|
| `binding_enabled` | `FAMILY_DATA_GATEWAY_BINDING_ENABLED=true` |
| `postgres_runtime_confirmed` | `FAMILY_DATA_POSTGRES_RUNTIME_CONFIRMED=FAMILY_DATA_PRIVATE_POSTGRES_CONFIRMED` |
| `tenant_supported` | tenant is `homosapiens-id` |
| `household_configured` | household id is present |
| `schema_configured` | schema name is present |
| `pool_present` | an external pool object was injected |
| `pool_query_present` | injected pool has `query()` |
| `pool_connect_present` | injected pool has `connect()` |
| `authorize_callback_present` | an authorization callback was injected |

## Safety properties

The plan explicitly returns:

| Property | Value |
|---|---|
| `performs_query` | `false` |
| `acquires_client` | `false` |
| `opens_network_connection` | `false` |
| `reads_credentials` | `false` |
| `deploy_executed` | `false` |
| `migration_executed` | `false` |
| `ingestion_executed` | `false` |

## Go/No-Go

| Activity | Decision |
|---|---|
| Gateway planning contract | GO |
| Unit tests for inactive behavior | GO |
| Real PostgreSQL connection | NO-GO |
| Runtime deploy | NO-GO |
| Schema migration | NO-GO |
| Bistek ingestion | NO-GO |
| MCP live registration | NO-GO |

## Next block

Block C should wire this planning contract into an explicit Gateway route or runtime composition point, still disabled by default and still returning only readiness metadata until the private PostgreSQL runtime gate is approved.
