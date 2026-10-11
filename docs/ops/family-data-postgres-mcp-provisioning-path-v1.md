# Family Data Core v1 - MCP PostgreSQL Provisioning Path

API Developers.digital | 2026-10-11  
Status: operational direction, MCP-first provisioning path, no production authorization.

This document records the operating decision: if a suitable private PostgreSQL runtime does not already exist, the correct path is to provision one through MCP/operator tools with dry-run, audit, rollback planning, and explicit approval.

This document does not authorize or execute provisioning, deployment, migrations, live probes, MCP live registration, or Bistek ingestion.

## 1. Direction

The Family Data Core v1 runtime must be operated through the institutional backend path:

```txt
ADA / Chat
-> MCP Brain
-> controlled operator tools
-> VPS / Gateway / PostgreSQL
-> audited results
```

Avoid ad-hoc manual VPS work as the canonical path. Manual local action may be used only as an operator-assisted step when the MCP/tooling contract explicitly asks Igor to run or approve a controlled command.

## 2. Current decision

| Question | Decision |
|---|---|
| What if PostgreSQL does not exist? | Provision a private PostgreSQL runtime. |
| How should it be provisioned? | Through MCP/operator tools, not by undocumented manual changes. |
| Should this block the project indefinitely? | No. It becomes a provisioning task with gates. |
| Can ADA execute the provisioning now? | No, not without explicit approval and a real execution tool/path. |
| Can development continue now? | Yes, through larger PR blocks that prepare tools, contracts, checks, and rollback. |

## 3. Required MCP/operator tool path

The following tool capabilities are required or should be created before real provisioning:

| Tool capability | Risk tier | Purpose | Real execution allowed now? |
|---|---:|---|---|
| `vps.status` | R1 | Confirm VPS OS, uptime, resources | Read-only only |
| `vps.network.status` | R1/R2 | Inspect firewall/private network posture without changing it | Read-only only |
| `vps.services.list` | R1 | List system services relevant to PostgreSQL | Read-only only |
| `vps.ports.list` | R1/R2 | List listening ports without exposing secrets | Read-only only |
| `postgres.detect` | R1/R2 | Detect whether PostgreSQL exists | Read-only only |
| `postgres.install.plan` | R3/R4 | Produce install plan without execution | Dry-run only |
| `postgres.install.execute` | R4/R5 | Install PostgreSQL packages/service | Requires explicit approval |
| `postgres.harden.plan` | R3/R4 | Plan TLS/network/role hardening | Dry-run only |
| `postgres.harden.execute` | R4/R5 | Apply hardening | Requires explicit approval |
| `postgres.backup.plan` | R3/R4 | Plan backup/restore | Dry-run only |
| `postgres.backup.execute` | R4/R5 | Create backup policy or snapshot | Requires explicit approval |
| `postgres.preflight.live` | R4 | Run minimal live metadata probe | Requires explicit approval |
| `postgres.migrate.plan` | R4 | Prepare schema migration and rollback | Dry-run only |
| `postgres.migrate.execute` | R5 | Apply schema migration | Requires explicit approval |
| `gateway.runtime.plan` | R3/R4 | Build/deploy plan for Gateway runtime | Dry-run only |
| `gateway.runtime.deploy` | R5 | Deploy Gateway runtime | Requires explicit approval |

## 4. Minimal provisioning target

A new private PostgreSQL runtime should meet these baseline requirements:

| Area | Requirement |
|---|---|
| Engine | PostgreSQL, version explicitly reported |
| Network | private network or strict allowlist; no broad public exposure |
| TLS | supported or required for client connections |
| Runtime access | only approved Gateway/MCP runtime path |
| Secrets | stored outside GitHub in approved runtime/secret store |
| Roles | separate migration/admin role and read-only runtime role |
| Database/schema | dedicated Family Data database/schema |
| Backup | backup schedule and restore procedure documented |
| Observability | service status, logs, metrics, and alerts available |
| Audit | operator actions recorded without secrets or private rows |
| Rollback | restore/no-op path known before migrations |
| Data minimization | no raw receipts/storage refs exposed to unauthorized consumers |
| Tenant isolation | `homosapiens-id` and household boundary explicit |

## 5. Provisioning stages

### Stage 0 - Read-only discovery

Goal: confirm whether PostgreSQL already exists.

Allowed:
- inspect services;
- inspect package presence;
- inspect non-secret ports;
- inspect firewall group/network posture;
- inspect backup availability.

Not allowed:
- read secrets;
- connect to database with credentials;
- change packages;
- open ports;
- modify firewall;
- deploy.

Decision:
- If PostgreSQL exists and passes baseline evidence: proceed to live preflight approval package.
- If PostgreSQL does not exist: proceed to Stage 1 provisioning plan.

### Stage 1 - Provisioning plan

Goal: prepare exact installation/hardening plan.

Must include:
- target VPS;
- PostgreSQL version;
- network model;
- TLS posture;
- roles to be created;
- database/schema names;
- backup/restore plan;
- observability plan;
- rollback/no-op plan;
- exact commands or tool actions, without secrets.

No execution.

### Stage 2 - Explicit approval

Required approval must be separate and specific.

Expected confirmation wording:

```txt
IGOR_APROVA_POSTGRES_PRIVATE_RUNTIME_PROVISIONING
```

This approval may authorize only the stated provisioning plan. It does not authorize migrations, Gateway deploy, MCP live registration, or Bistek ingestion.

### Stage 3 - Provisioning execution

Execute only through MCP/operator tooling where available.

If MCP tooling is not yet sufficient, the operator may ask Igor to run a controlled command locally, but the command must be non-secret, scoped, reversible where possible, and documented.

### Stage 4 - Post-provisioning evidence

Collect non-secret proof:
- PostgreSQL service status;
- version;
- listening interface posture;
- firewall/private network posture;
- TLS capability;
- role separation presence;
- backup/restore readiness;
- log/metric availability.

### Stage 5 - Live preflight approval package

Only after Stage 4 may a live PostgreSQL preflight be requested. That approval must be separate from provisioning approval.

## 6. What remains blocked

| Activity | Status |
|---|---|
| Real PostgreSQL provisioning | Blocked until explicit approval |
| Live PostgreSQL probe | Blocked until provisioning evidence and explicit approval |
| Schema migration | Blocked until live preflight succeeds and migration plan is approved |
| Gateway deployment | Blocked until runtime artifact is built from approved source and deploy plan is approved |
| MCP live registration | Blocked until Gateway and authorization scopes are validated |
| Bistek ingestion | Blocked until database, schema, roles, ingestion policy, validation totals, and rollback are approved |

## 7. Execution model when a tool is missing

If an MCP tool does not yet exist, create the tool contract first.

Preferred order:
1. document the tool contract;
2. implement read-only/dry-run behavior;
3. test that dangerous operations are blocked by default;
4. expose explicit confirmation literal for real action;
5. only then request Igor approval for execution.

Do not bypass this model with undocumented shell operations.

## 8. Bigger-block development plan to finish faster

The remaining work should be grouped into larger functional blocks:

| Block | Goal | Output |
|---|---|---|
| H | MCP provisioning path and approval contract | this document |
| I | MCP/tool contract for VPS/PostgreSQL discovery | code + tests + docs |
| J | PostgreSQL install/hardening dry-run plan | code + tests + operator plan |
| K | Runtime artifact reconciliation/build path | CI/build plan, no deploy |
| L | Live preflight package | approval document, no execution |
| M | Schema migration package | migration + rollback + tests, no execution |
| N | Gateway production deploy package | build/deploy/rollback plan |
| O | MCP live registration package | scoped tools + authorization |
| P | Bistek ingestion package | ingestion job + validation + rollback |

## 9. Current GO/NO-GO

| Activity | Decision |
|---|---|
| Continue GitHub development in stacked Draft PRs | GO |
| Build MCP contracts and dry-run tools | GO |
| Prepare PostgreSQL provisioning plan | GO |
| Execute PostgreSQL provisioning | NO-GO until approval |
| Execute live probe | NO-GO until separate approval |
| Run migrations | NO-GO |
| Deploy Gateway | NO-GO |
| Register MCP live tools | NO-GO |
| Ingest Bistek data | NO-GO |

## 10. Current conclusion

The project should no longer treat missing PostgreSQL as an indefinite blocker. It is now a controlled provisioning workstream.

The next concrete development block is to implement or document the MCP discovery tools required to answer: "Does the VPS already have a suitable PostgreSQL runtime, and if not, what exact dry-run plan will create one safely?"
