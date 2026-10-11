# Family Data Core v1 - PostgreSQL Protected Preflight Endpoint

API Developers.digital | 2026-10-11  
Status: metadata-only endpoint, dry-run-first, no production authorization.

This block exposes the protected PostgreSQL preflight contract as an explicit Gateway endpoint.

## Route

```txt
GET /v1/family-data/postgres/preflight
```

The route accepts an optional query parameter:

```txt
mode=dry_run
mode=live_probe
```

Default mode is `dry_run`.

## Purpose

Expose the private PostgreSQL readiness plan through the Gateway without performing a real database probe.

The endpoint can be used by operators and CI to inspect whether the runtime is structurally ready for a future private PostgreSQL probe.

## Files added or changed

- `apps/api-gateway/src/family-data-postgres-preflight-wrapper.mjs`
- `apps/api-gateway/src/hostinger-entry.mjs`
- `tests/family-data-postgres-preflight-wrapper.test.mjs`
- `docs/ops/family-data-postgres-preflight-endpoint-v1.md`

## Safety contract

The endpoint returns metadata only.

It does not:

- connect to PostgreSQL;
- acquire a client;
- execute SQL;
- read credentials;
- mutate schema;
- deploy runtime code;
- register MCP live tools;
- ingest Bistek data.

The embedded preflight plan explicitly reports:

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

## Live-probe planning gate

`mode=live_probe` requires the confirmation literal:

```txt
FAMILY_DATA_PRIVATE_POSTGRES_PREFLIGHT_APPROVED
```

This literal only allows the endpoint to report that live-probe planning gates are satisfied.

It does not execute a live probe.

The separate runner introduced in the previous block still blocks live probe execution by operator policy.

## Go/No-Go

| Activity | Decision |
|---|---|
| Expose metadata-only endpoint | GO |
| Unit-test endpoint behavior | GO |
| Attach endpoint to Hostinger Gateway composition | GO |
| Real PostgreSQL probe | NO-GO |
| Credential use | NO-GO |
| SQL execution | NO-GO |
| Production deploy | NO-GO |
| Schema migration | NO-GO |
| Bistek ingestion | NO-GO |
| MCP live registration | NO-GO |

## Next block

Block F should prepare an operator-facing GO/NO-GO checklist for the real PostgreSQL private runtime, including evidence requirements for TLS, network restriction, backup/restore, read-only role, migration role, and rollback.

That block must remain documentation and validation only unless a separate explicit approval is provided.
