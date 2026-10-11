# Family Data Core v1 - MCP Tool Contracts for Private PostgreSQL Runtime

API Developers.digital | 2026-10-11  
Status: MCP/operator contract, dry-run first, no production authorization.

This document defines the minimum MCP tool contract required to finish the Family Data Core v1 private PostgreSQL runtime path quickly and safely.

It does not authorize provisioning, package installation, firewall changes, credential creation, migrations, deploy, MCP live registration, or Bistek ingestion.

## 1. Operating principle

All VPS, PostgreSQL, and Gateway operations for this front should use the canonical path:

```txt
ADA / Chat -> MCP Brain -> controlled MCP tools -> VPS / Gateway / PostgreSQL -> audited result
```

Ad-hoc manual VPS access is not the canonical path. If manual execution is temporarily required, the operator must treat it as a bridge step and bring the result back into MCP evidence.

## 2. Risk levels

| Level | Class | Examples | Requirement |
|---|---|---|---|
| R1 | Read-only metadata | status, package presence, service list | allowed read-only |
| R2 | Dry-run planning | install plan, config plan, migration plan | allowed dry-run |
| R3 | Non-destructive validation | local config validation, no network secret exposure | explicit scope |
| R4 | System change | install packages, write config, firewall change, service restart | explicit approval |
| R5 | Data or production impact | live DB probe, migration, deploy, ingestion | separate explicit approval |

## 3. Required MCP tools

| Tool | Risk | Purpose | Default |
|---|---:|---|---|
| `family_data.vps.status` | R1 | Identify VPS OS, resources, uptime, IP posture without secrets | read-only |
| `family_data.vps.services.list` | R1 | List relevant services: PostgreSQL, nginx/caddy, node, firewall | read-only |
| `family_data.vps.ports.list` | R1 | List listening ports and bind addresses without secrets | read-only |
| `family_data.postgres.detect` | R1 | Detect PostgreSQL installation/version and service state | read-only |
| `family_data.postgres.install.plan` | R2 | Produce package/install plan only | dry-run |
| `family_data.postgres.install.execute` | R4 | Install PostgreSQL when approved | blocked by default |
| `family_data.postgres.config.plan` | R2 | Plan TLS, listen address, pg_hba, service user, backups | dry-run |
| `family_data.postgres.config.apply` | R4 | Apply PostgreSQL config when approved | blocked by default |
| `family_data.postgres.roles.plan` | R2 | Plan migration/read-only roles without showing passwords | dry-run |
| `family_data.postgres.roles.apply` | R5 | Create roles when approved | blocked by default |
| `family_data.postgres.schema.plan` | R2 | Plan canonical schema creation | dry-run |
| `family_data.postgres.schema.apply` | R5 | Apply schema/migrations when approved | blocked by default |
| `family_data.postgres.preflight` | R3/R5 | Dry-run by default; live probe only after explicit approval | dry-run |
| `family_data.postgres.backup.status` | R1 | Confirm backup schedule and restore evidence | read-only |
| `family_data.gateway.runtime.status` | R1 | Report deployed Gateway runtime source SHA and branch | read-only |
| `family_data.gateway.deploy.plan` | R2 | Build/deploy preview from approved source SHA | dry-run |
| `family_data.gateway.deploy.execute` | R5 | Deploy Gateway runtime when approved | blocked by default |

## 4. Required approval literals

| Operation | Confirmation literal |
|---|---|
| Provision private PostgreSQL runtime | `IGOR_APROVA_POSTGRES_PRIVATE_RUNTIME_PROVISIONING` |
| Apply PostgreSQL config | `IGOR_APROVA_POSTGRES_PRIVATE_CONFIG_APPLY` |
| Create database roles | `IGOR_APROVA_POSTGRES_PRIVATE_ROLES_APPLY` |
| Apply schema/migrations | `IGOR_APROVA_FAMILY_DATA_SCHEMA_MIGRATION` |
| Execute live PostgreSQL preflight | `IGOR_APROVA_FAMILY_DATA_POSTGRES_LIVE_PREFLIGHT` |
| Deploy Gateway runtime | `IGOR_APROVA_GATEWAY_RUNTIME_DEPLOY` |
| Register MCP live tool | `IGOR_APROVA_MCP_FAMILY_DATA_LIVE_REGISTRATION` |
| Ingest Bistek dataset | `IGOR_APROVA_BISTEK_INGESTION` |

Approvals are intentionally separate. Approval for one action does not authorize any other action.

## 5. Non-secret output contract

Every MCP tool response must avoid secrets and return structured evidence:

```json
{
  "ok": true,
  "dry_run": true,
  "risk": "R1|R2|R3|R4|R5",
  "action": "family_data.postgres.detect",
  "performed": false,
  "confirmed": [],
  "pending": [],
  "blocked": [],
  "next_step": "..."
}
```

Tools must not return passwords, tokens, private keys, database URLs, `.env` content, raw receipt data, storage references, or private family rows.

## 6. Provisioning path if PostgreSQL does not exist

If PostgreSQL is not detected, continue in this order:

1. `family_data.vps.status`
2. `family_data.vps.services.list`
3. `family_data.vps.ports.list`
4. `family_data.postgres.detect`
5. `family_data.postgres.install.plan`
6. operator approval: `IGOR_APROVA_POSTGRES_PRIVATE_RUNTIME_PROVISIONING`
7. `family_data.postgres.install.execute`
8. `family_data.postgres.config.plan`
9. operator approval: `IGOR_APROVA_POSTGRES_PRIVATE_CONFIG_APPLY`
10. `family_data.postgres.config.apply`
11. `family_data.postgres.backup.status`
12. `family_data.postgres.preflight` in dry-run
13. separate approval before live preflight

## 7. GO/NO-GO

| Activity | Decision |
|---|---|
| Define MCP tool contracts | GO |
| Implement dry-run MCP wrappers | GO |
| Detect PostgreSQL through MCP read-only tool | GO |
| Provision PostgreSQL | NO-GO until explicit approval |
| Apply PostgreSQL config | NO-GO until explicit approval |
| Create roles | NO-GO until explicit approval |
| Run live PostgreSQL probe | NO-GO until explicit approval |
| Run migrations | NO-GO until explicit approval |
| Deploy Gateway runtime | NO-GO until explicit approval |
| Register MCP live tool | NO-GO until explicit approval |
| Ingest Bistek data | NO-GO until explicit approval |

## 8. Next block

Block J should implement the first read-only MCP discovery contract or adapter for this path:

- status;
- service detection;
- port detection;
- PostgreSQL package/service detection;
- backup evidence;
- no secrets;
- no mutations.

The goal is to move from documentation into MCP-operated discovery without jumping to installation.
