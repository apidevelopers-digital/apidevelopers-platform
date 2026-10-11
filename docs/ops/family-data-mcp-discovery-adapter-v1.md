# Family Data Core v1 - MCP Discovery Adapter

API Developers.digital | 2026-10-11  
Status: read-only adapter contract, no production authorization.

This block prepares the first MCP-facing discovery adapter for the Family Data Core v1 private PostgreSQL runtime path.

It does not install PostgreSQL, change the VPS, open a database connection, execute SQL, read credentials, run migrations, deploy Gateway runtime code, register MCP live tools, or ingest Bistek data.

## Purpose

Provide a code-level adapter contract for collecting non-secret infrastructure evidence through MCP tools.

The intended path remains:

```txt
ADA / Chat -> MCP Brain -> controlled MCP tools -> VPS / Gateway / PostgreSQL -> audited result
```

## Files

- `apps/api-gateway/src/family-data-mcp-postgres-discovery-adapter.mjs`
- `tests/family-data-mcp-discovery-adapter.test.mjs`
- `docs/ops/family-data-mcp-discovery-adapter-v1.md`

## Required MCP tools

The adapter declares these read-only tool contracts:

| Tool | Purpose | Mode |
|---|---|---|
| `vps.status` | Confirm target VPS presence and basic state | read-only |
| `vps.services.list` | List relevant services without mutation | read-only |
| `vps.ports.list` | List listening ports/firewall posture without mutation | read-only |
| `postgres.detect` | Detect PostgreSQL presence/version without exposing credentials | read-only |
| `postgres.backup.status` | Report backup evidence without secrets | read-only |
| `gateway.runtime.status` | Report Gateway runtime branch/commit/source state | read-only |

## Safety properties

The adapter hard-codes these non-production properties:

| Property | Value |
|---|---|
| `dry_run` | `true` |
| `read_only` | `true` |
| `performs_mutation` | `false` |
| `executes_shell` | `false` |
| `reads_credentials` | `false` |
| `connects_to_database` | `false` |

The adapter accepts an injected `callTool` function. It does not import shell helpers and does not contain direct VPS, SSH, database, or Hostinger credentials.

## Redaction

The adapter removes obvious sensitive fields from returned evidence before returning the aggregate result.

Redacted field name patterns include:

- `password`
- `secret`
- `token`
- `key`
- `credential`
- `connection`
- `dsn`

This is a defensive safety layer. MCP tools themselves must also avoid returning secrets.

## GO/NO-GO logic

The adapter returns:

```txt
GO_FOR_APPROVAL_PACKAGE
```

only when all of these are present:

- VPS evidence;
- PostgreSQL detected;
- PostgreSQL version evidence;
- TLS/SSL evidence;
- private network, allowlist, or firewall evidence;
- backup evidence;
- Gateway runtime evidence;
- Gateway runtime confirmed to come from current approved source.

Otherwise it returns:

```txt
NO_GO
```

with explicit blockers.

## Current operational meaning

This adapter is not the live provisioning tool.

It is the first code contract for safely collecting the evidence needed before an operator can prepare a future approval package for live PostgreSQL work.

## Next block

Block K should either:

1. wire this adapter into a metadata-only endpoint, or
2. implement the corresponding MCP Brain tool handlers in the MCP operator service.

No real PostgreSQL provisioning should occur until those handlers exist, dry-run evidence is collected, and Igor gives separate explicit approval.
