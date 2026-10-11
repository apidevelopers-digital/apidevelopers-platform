# Family Data Core v1 - Private PostgreSQL Infrastructure Evidence Package

API Developers.digital | 2026-10-11  
Status: read-only infrastructure evidence, non-secret, no production authorization.

This document records the non-secret infrastructure evidence collected for the Family Data Core v1 private PostgreSQL gate.

No production change is authorized or implied by this document.

This evidence package does not include passwords, tokens, connection strings, private keys, raw receipt files, storage references, personal family records, public IP addresses, hostnames, or private infrastructure details that would increase exposure.

## 1. Scope

This evidence package supports the GO/NO-GO process for the Family Data Core v1 path:

```txt
Chat/ADA -> MCP Brain -> Service Hub or Gateway -> Family Data Core -> private PostgreSQL -> authorized consumers
```

Reference tenant:

```txt
homosapiens-id
```

Reference logical dataset:

```txt
family.grocery.bistek.v1
```

## 2. Read-only sources checked

| Source | Mode | Result |
|---|---|---|
| Hostinger websites inventory | Read-only | Gateway website exists and is enabled |
| Hostinger database inventory | Read-only | Databases found on port 3306 only |
| Hostinger Node.js builds | Read-only | Gateway builds use the packaged runtime branch |
| Hostinger VPS details | Read-only | VPS exists and is running Ubuntu 24.04 LTS |
| Hostinger VPS backups | Read-only | At least one VPS backup exists |
| Hostinger VPS Docker Manager | Read-only | Not supported on current VPS installation |
| Hostinger VPS SSH keys endpoint | Read-only | Endpoint unavailable through current API route |

## 3. Confirmed evidence

| Area | Confirmed |
|---|---|
| Gateway website | `gateway.apidevelopers.digital` exists as an enabled Node.js website in Hostinger |
| Gateway runtime source | Node.js builds point to Git source `apidevelopers-digital/apidevelopers-platform`, branch `deploy/hostinger-gateway-runtime` |
| Latest observed Gateway build | Completed, Node 22, Express, entrypoint `src/hostinger-entry.mjs` |
| Latest observed runtime branch commit | `3b1e2d61e94d623c18eb5de833128ea8244dc186` |
| Latest observed runtime source SHA | Build message indicates runtime from `5559826bbe501dc73c02ea3fdbe8350cb93b77f8` |
| Runtime vs current main | Previous reconciliation found the runtime branch is a packaged artifact branch, not a normal development branch comparable to `main` |
| Hosted databases | Hostinger hosting databases are listed on port `3306` |
| Gateway-associated hosted database | A database associated with the Gateway domain exists, but its port is `3306` and its permissions are broad |
| VPS | A VPS exists and is running Ubuntu 24.04 LTS |
| VPS plan class | KVM 2 |
| VPS resources | 2 vCPU, 8192 MB RAM, 102400 MB disk |
| VPS firewall group | No firewall group is attached according to the exposed field |
| VPS backups | At least one backup snapshot exists, created on 2026-10-09 |
| Docker Manager | Hostinger reports Docker Manager is not supported by the current VPS installation |
| SSH public key listing | The API route for attached public keys returned "Route is not found" |

## 4. Inferred evidence

| Area | Inference |
|---|---|
| Hosted database engine | The visible hosting databases are likely MySQL/MariaDB-compatible because they use port `3306`; this does not prove PostgreSQL |
| Gateway runtime freshness | The deployed Gateway runtime is not proven to contain the current Family Data Core v1 work merged to or stacked after current `main` |
| PostgreSQL runtime | A suitable private PostgreSQL runtime is not yet demonstrated |
| Private network posture | Not demonstrated; VPS firewall group is absent in the exposed Hostinger field |
| Backup posture | A VPS backup exists, but backup policy, retention, restore process, and database-level restore are not yet demonstrated |
| Role separation | Not demonstrated for PostgreSQL read-only vs migration roles |
| Observability | Not demonstrated for PostgreSQL-specific logs, metrics, alerts, or audit trail |

## 5. Pending evidence

| Gate | Required evidence | Status |
|---|---|---|
| PostgreSQL engine | Provider/runtime confirms PostgreSQL, not MySQL/MariaDB | Pending |
| Private network | Allowlist, VPC/private network, tunnel, firewall, or equivalent private access model | Pending |
| TLS | TLS required or supported for database client connection | Pending |
| Runtime source | Approved source that can reach the private database without exposing secrets | Pending |
| Secret storage | Runtime secret store confirmed without exposing values | Pending |
| Read-only role | Dedicated PostgreSQL read-only role exists | Pending |
| Migration role | Separate migration role exists or is planned with explicit gate | Pending |
| Database/schema | Target database and schema confirmed without leaking sensitive names where not needed | Pending |
| Backup policy | Backup schedule and retention confirmed | Partial |
| Restore | Restore method or tested restore path confirmed | Pending |
| Observability | Metrics/logs/alerts/audit confirmed without personal data leakage | Pending |
| Rollback | Runtime rollback and database rollback/restore procedure documented | Pending |
| Tenant isolation | `homosapiens-id` and household boundary enforcement demonstrated | Pending |
| Data minimization | No raw receipts, storage refs, or financial private details exposed to unauthorized consumers | Pending |

## 6. Rejected or insufficient evidence

| Evidence | Reason |
|---|---|
| Hostinger hosted databases on port `3306` | Insufficient for PostgreSQL confirmation |
| Gateway domain having a database attached | Insufficient because the database type/port does not match PostgreSQL evidence |
| VPS existence alone | Insufficient because PostgreSQL installation/configuration was not proven |
| VPS backup existence alone | Insufficient because database backup/restore is not proven |
| Docker Manager inspection | Not available through Hostinger for the current VPS installation |
| Runtime deploy branch existence | Insufficient because it is a packaged runtime branch, not proof of current `main` deployment |

## 7. Current GO/NO-GO decision

| Activity | Decision | Reason |
|---|---|---|
| Continue documentation and metadata-only code | GO | Safe and non-production |
| Continue read-only infrastructure inventory | GO | No secrets or mutations involved |
| Prepare a future approval request for live probe | GO, only after missing evidence is collected | Requires stronger evidence package |
| Execute live PostgreSQL probe | NO-GO | PostgreSQL private runtime not proven and approval not granted |
| Run schema migrations | NO-GO | Requires proven database, backup/restore, rollback, and approval |
| Deploy Gateway runtime | NO-GO | Runtime source is not reconciled with current Family Data stack |
| Register MCP live tool | NO-GO | Gateway/runtime/database readiness not proven |
| Ingest Bistek data | NO-GO | Not the current blocker; requires private runtime and schema first |

## 8. Operator report template

Use this format before any future live-probe request:

```txt
Family Data Core v1 - Private PostgreSQL Evidence Review

Confirmed:
- ...

Inferred:
- ...

Pending:
- ...

Blocked:
- ...

Decision:
- GO for ...
- NO-GO for ...

Sensitive data excluded:
- passwords
- tokens
- connection strings
- private keys
- raw receipts
- storage references
- personal family rows

Approval requested:
- Exact operation:
- Environment:
- Runtime identity:
- Scope:
- SQL scope:
- Rollback/no-op statement:
- Confirmation literal:
```

## 9. Current conclusion

The infrastructure evidence confirms an active Gateway Node.js website, a packaged Gateway runtime branch, a running Ubuntu VPS, and at least one VPS backup.

The evidence does not confirm a suitable private PostgreSQL runtime.

The next action is not a live database probe. The next action is to identify how PostgreSQL will be provided privately and collect non-secret evidence for engine type, network posture, TLS, role separation, backup/restore, observability, and rollback.

```txt
GO: documentation, static code, metadata-only endpoints, dry-run planning, read-only inventory
NO-GO: live PostgreSQL connection, SQL execution, migrations, deploy, MCP live registration, Bistek ingestion
```
