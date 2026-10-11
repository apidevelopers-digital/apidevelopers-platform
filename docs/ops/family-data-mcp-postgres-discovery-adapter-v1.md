# Family Data Core v1 - MCP PostgreSQL Discovery Adapter

API Developers.digital | 2026-10-11  
Status: read-only adapter contract, no production authorization.

This block implements the first read-only adapter for the future MCP tool path that discovers whether the VPS/hosting environment is suitable for the Family Data Core v1 private PostgreSQL runtime.

No PostgreSQL connection, SQL execution, credential read, package install, firewall change, deployment, MCP live registration, or Bistek ingestion is performed by this adapter.

## File added

- `packages/hostinger-adapter/src/family-data-postgres-discovery.mjs`

## Test added

- `tests/family-data-postgres-discovery.test.mjs`

## Intended MCP tool

The adapter is intended to support a future MCP read-only tool such as:

```txt
family_data.postgres.discovery
```

or the equivalent institutional name selected by the MCP Brain registry.

## Input

The adapter receives already-collected, non-secret inventory objects:

| Input | Meaning |
|---|---|
| `vps` | VPS details/status |
| `backups` | VPS backup listing |
| `databases` | Hosted database inventory |
| `remoteAccess` | Remote database access inventory |
| `nodeBuilds` | Gateway Node.js build inventory |

The adapter does not call Hostinger itself. The future MCP tool should call the approved inventory tools, then pass sanitized results into this adapter.

## Output

The report includes:

| Field | Meaning |
|---|---|
| `mode` | Always `read_only` |
| `safe_for_mcp_read_only_tool` | Always `true` |
| `vps` | Sanitized VPS status |
| `backups` | Backup presence/count |
| `databases` | PostgreSQL/MySQL evidence summary |
| `remote_access` | Broad access warning |
| `node_builds` | Gateway runtime branch summary |
| `blockers` | Hard blockers before live PostgreSQL probe |
| `warnings` | Operational risks |
| `decision` | `GO_FOR_APPROVAL_PACKAGE` or `NO_GO_FOR_LIVE_POSTGRES_PROBE` |

## Safety properties

| Property | Value |
|---|---|
| `mutates_infrastructure` | `false` |
| `reads_credentials` | `false` |
| `opens_network_connection_to_database` | `false` |
| `executes_sql` | `false` |
| `installs_packages` | `false` |
| `deploys_runtime` | `false` |

## Current expected decision

With the current evidence shape observed for Hostinger/VPS, the expected decision remains:

```txt
NO_GO_FOR_LIVE_POSTGRES_PROBE
```

Expected blockers include:

- `postgres_not_detected`
- `vps_firewall_group_not_configured`

Expected warnings include:

- `gateway_runtime_not_proven_current_main`
- `mysql_mariadb_hosting_database_present_not_postgres`
- `broad_remote_database_access_present`

## Next block

Block K should wire this adapter into the actual MCP Brain/tool registry path when the backend source location is confirmed.

If the MCP Brain source repository is separate from `apidevelopers-platform`, that repository must be identified before registering the live MCP tool.
