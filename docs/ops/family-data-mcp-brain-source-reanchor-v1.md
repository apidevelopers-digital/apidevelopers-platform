# Family Data Core v1 - MCP Brain Source Reanchor

API Developers.digital | 2026-10-11  
Status: reanchor and wiring plan, no runtime mutation, no production authorization.

This report records the current evidence about the MCP Brain source path before wiring the Family Data PostgreSQL discovery adapter into a live MCP tool.

No deploy, MCP runtime mutation, PostgreSQL connection, SQL execution, credential read, package installation, migration, or Bistek ingestion was performed.

## 1. Purpose

Confirm where the MCP Brain / `ada-enterprise-operator-v2` should be evolved before adding a live read-only discovery tool for Family Data Core v1.

The intended future tool remains read-only:

```txt
family_data.postgres.discovery
```

or an equivalent institutional tool name selected by the MCP Brain registry.

## 2. Confirmed evidence

| Area | Evidence |
|---|---|
| MCP Brain runtime | `api-dev-brain-01` is online. |
| Adapter identity | Runtime identifies as `ada-enterprise-operator-v2`. |
| Role | `mcp_trust_control_plane`. |
| Host | Hostinger `srv2028303`. |
| Tenants | `apidevelopers-digital` and `homosapiens-id`. |
| Runtime safety | Dry-run default, R4/R5 confirmation model, no free shell, no secret exposure. |
| Registry access | `/opt/api-dev-brain/registry` is readable through MCP. |
| Root filesystem access | `/opt/api-dev-brain` outside the allowed registry root is blocked. |
| Registry repositories | Registry currently records `homosapiens-id/chefsapiens-core`; it does not yet prove a canonical source repository for the MCP Brain itself. |
| Candidate repository | `apidevelopers-digital/unico-api-platform` is a strong candidate for the operational backend source. |
| Candidate basis | `unico-api-platform` is a private Node.js API with `src/server.js`, `src/operator`, `src/services`, operational bridges, Hostinger scripts, and `pg` dependency. |
| Platform adapter | `apidevelopers-platform` PR #731 adds a read-only Family Data PostgreSQL discovery adapter intended for MCP/tool integration. |

## 3. Inferred

| Inference | Basis |
|---|---|
| MCP Brain should remain the control plane for this operation. | The runtime is online, API/tool based, dry-run by default, and blocks direct shell/secret exposure. |
| `unico-api-platform` is likely the right repository to inspect next for live tool routing. | It is the current operational Node.js API repository and includes operator/service/bridge structure plus dependencies used for Hostinger and PostgreSQL work. |
| The adapter in `apidevelopers-platform` should not be registered live until the MCP backend source path is confirmed. | Registering in the wrong repository would create drift between docs, runtime and tools. |

## 4. Pending

| Item | Status |
|---|---|
| Canonical source repository for `ada-enterprise-operator-v2` | Pending confirmation |
| Exact tool registry implementation file | Pending |
| Existing MCP route pattern for adding tools | Pending |
| Naming convention for Family Data MCP tools | Pending |
| CI workflow for MCP backend source | Pending |
| Deployment path for MCP backend updates | Pending |
| Rollback path for MCP backend updates | Pending |

## 5. Blocked

| Activity | Reason |
|---|---|
| Live MCP tool registration | Source repository and registry implementation are not fully confirmed. |
| VPS/PostgreSQL provisioning | Requires explicit approval and an MCP execution path. |
| Live PostgreSQL probe | PostgreSQL private runtime is not confirmed and no probe approval was given. |
| Gateway deploy | Runtime branch remains a packaged deploy artifact and not proven current with `main`. |
| Bistek ingestion | Database, schema, roles, backup/restore and authorization gates are not complete. |

## 6. Required next investigation in `unico-api-platform`

Before writing a live MCP tool, inspect:

1. `src/server.js`
2. `src/operator`
3. `src/services`
4. root bridge files used by `npm start`
5. route or tool registration files
6. existing dry-run and confirmation helpers
7. tests for operator and Hostinger tools
8. workflows and deployment scripts

## 7. Proposed MCP tool contract

```txt
Tool: family_data.postgres.discovery
Risk: R2 / read-only
Default: dry_run=true
Writes: none
Secrets: never returned
Shell: not allowed
Database connection: not opened
SQL execution: not performed
Inputs:
  - target_domain
  - vps_id
  - hosting_username
  - dry_run
Outputs:
  - vps summary
  - backup summary
  - database engine evidence
  - remote access risk summary
  - gateway runtime branch summary
  - blockers
  - warnings
  - decision
```

The tool should call only approved inventory sources, sanitize the result, then feed the data into the adapter introduced in PR #731.

## 8. Safety requirements

The future tool must report these as false:

| Property | Required value |
|---|---|
| `mutates_infrastructure` | `false` |
| `reads_credentials` | `false` |
| `opens_network_connection_to_database` | `false` |
| `executes_sql` | `false` |
| `installs_packages` | `false` |
| `deploys_runtime` | `false` |

## 9. Current decision

```txt
GO: continue source reanchor and read-only MCP adapter wiring design
NO-GO: live MCP registration, VPS provisioning, PostgreSQL live probe, migrations, deploy, Bistek ingestion
```

## 10. Next block

Block L should inspect `unico-api-platform` routing and service structure and prepare the actual wrapper/route for `family_data.postgres.discovery` only after confirming the repository is the canonical MCP backend source.

If `unico-api-platform` is confirmed, the implementation should occur there in a separate Draft PR. If it is not confirmed, the work must remain documented in `apidevelopers-platform` until the canonical repository is identified.
