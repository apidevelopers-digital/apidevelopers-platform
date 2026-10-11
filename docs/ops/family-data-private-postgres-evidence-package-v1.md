# Family Data Core v1 - Private PostgreSQL Evidence Package v1

API Developers.digital | 2026-10-11
Status: read-only infrastructure evidence, no production authorization.

This document records non-secret infrastructure evidence collected for the Family Data Core v1 private PostgreSQL gate.

No deployment, database connection, SQL execution, credential read, migration, MCP live registration, or Bistek ingestion was executed.

## 1. Evidence sources checked

| Source | Mode | Result |
|---|---|---|
| Hostinger subscriptions | Read-only API | Active VPS subscription found |
| Hostinger VPS inventory | Read-only API | One running Ubuntu 24.04 VPS found |
| Hostinger VPS backups | Read-only API | One VPS backup snapshot found |
| Hostinger VPS metrics | Read-only API | Recent CPU/RAM/disk/network/uptime metrics available |
| Hostinger hosted websites | Read-only API | `gateway.apidevelopers.digital` exists as Node.js website |
| Hostinger hosted databases | Read-only API | Six hosted databases visible, all on port 3306 |
| VPS Docker Manager | Read-only API | Not supported by current VPS OS/install through Hostinger route |

## 2. Confirmed non-secret evidence

| Area | Confirmed evidence | Classification |
|---|---|---|
| VPS subscription | KVM 2 subscription is active | Confirmed |
| VPS state | One VPS is running on Ubuntu 24.04 LTS | Confirmed |
| VPS resources | 2 vCPU, 8192 MB memory, 102400 MB disk class reported by Hostinger | Confirmed |
| VPS backups | One backup snapshot is visible in Hostinger VPS backup listing | Confirmed |
| VPS metrics | Hostinger exposes recent CPU, RAM, disk, network and uptime metrics | Confirmed |
| Gateway website | `gateway.apidevelopers.digital` is enabled and typed as Node.js website | Confirmed |
| Shared-hosting databases | Visible databases are hosted on port 3306 | Confirmed |
| Shared-hosting database permissions | Visible shared-hosting database users have broad write/admin-style permissions | Confirmed |
| Docker Manager | Hostinger Docker Manager route reports the current installed operating system does not support Docker Manager | Confirmed |

## 3. PostgreSQL readiness conclusion

The current evidence does not prove that a private PostgreSQL runtime exists.

The shared-hosting database inventory points to port 3306, which is compatible with MySQL/MariaDB style hosting and is not evidence of PostgreSQL.

The VPS could host PostgreSQL in the future, but the read-only Hostinger evidence collected here does not show PostgreSQL installed, configured, isolated, backed up at database level, reachable through a private network, or protected by read-only/migration role separation.

## 4. GO/NO-GO table

| Gate | Current status | Evidence |
|---|---|---|
| PostgreSQL engine confirmed | Blocked | No PostgreSQL-specific evidence found |
| Private network posture | Pending | VPS exists, but no allowlist/VPC/private network evidence collected |
| TLS posture | Pending | No TLS requirement/support evidence for PostgreSQL collected |
| Approved runtime source | Pending | Gateway website exists; current deploy branch remains separate from `main` lineage |
| Secret storage location type | Pending | Not inspected; no secrets were read |
| Read-only role | Blocked | No PostgreSQL role evidence; shared-hosting DB users show broad permissions |
| Migration role | Pending | No PostgreSQL migration role evidence collected |
| Database/schema name | Pending | No real PostgreSQL database/schema evidence collected |
| Backup | Partial | VPS snapshot exists; PostgreSQL-level backup/restore not proven |
| Restore | Pending | No PostgreSQL restore procedure evidence collected |
| Observability | Partial | VPS metrics exist; PostgreSQL-specific observability not proven |
| Audit logging | Pending | No PostgreSQL audit evidence collected |
| Rollback | Pending | No runtime/database rollback plan proven beyond VPS snapshot visibility |
| Tenant isolation | Pending | Must be proven at application/database policy level before live use |
| Data minimization | Pending | Must be proven in runtime/query contracts before live use |

## 5. Rejected evidence

| Candidate evidence | Decision | Reason |
|---|---|---|
| Hostinger hosted databases on port 3306 | Rejected for PostgreSQL gate | Port and hosting shape do not prove PostgreSQL and permissions are too broad for read-only runtime |
| VPS exists and is running | Insufficient alone | A VPS can host PostgreSQL, but existence alone does not prove PostgreSQL runtime readiness |
| VPS backup snapshot | Partial only | Snapshot does not prove PostgreSQL backup/restore, point-in-time recovery, or restore validation |
| Gateway Node.js website exists | Insufficient alone | Website existence does not prove current Family Data Core code is deployed |

## 6. Safe next evidence to collect

The next read-only evidence package should identify, without secrets:

1. whether PostgreSQL is actually installed or provisioned;
2. whether it is on the VPS or an external managed provider;
3. engine major version;
4. network exposure model;
5. TLS posture;
6. secret storage location type, not values;
7. planned read-only role name convention, not password;
8. planned migration role name convention, not password;
9. backup schedule and restore method;
10. monitoring/audit source;
11. runtime source SHA intended for future deploy;
12. rollback artifact/path.

## 7. Required operator approval later

A real live probe remains blocked until a separate approval states:

| Field | Required |
|---|---|
| Target environment | Yes |
| Runtime identity | Yes |
| Allowed source | Yes |
| SQL scope | Minimal metadata only |
| Exclusions | No migrations, no deploy, no ingestion |
| Time window | Yes |
| Approver | Igor |
| Confirmation literal | `FAMILY_DATA_PRIVATE_POSTGRES_PREFLIGHT_APPROVED` |

## 8. Current decision

```txt
GO:
- Continue documentation, static code, metadata-only endpoints, dry-run planning, and non-secret evidence collection.

NO-GO:
- Real PostgreSQL connection.
- SQL execution.
- Credential access.
- Schema migration.
- Runtime deploy.
- MCP live registration.
- Bistek ingestion.
```

## 9. Development percentage

Family Data Core v1 remains estimated at:

```txt
50% complete / 50% remaining / +/- 15 percentage points
```

Reason: implementation scaffolding and safety gates have advanced, but the main blockers remain unproven infrastructure, real integration, deploy, observability, backup/restore, and end-to-end operation.
