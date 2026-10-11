# Family Data Core v1 - Non-secret Infrastructure Evidence Package

API Developers.digital | 2026-10-11
Status: read-only evidence collection, no production authorization.

This report records non-secret infrastructure evidence collected for the Family Data Core v1 PostgreSQL private runtime gate.

No PostgreSQL connection, SQL execution, credential read, migration, deployment, MCP live registration, or Bistek ingestion was performed.

## 1. Evidence sources

| Source | Mode | Result |
|---|---|---|
| Hostinger subscriptions | Read-only | One active Business hosting order was visible. |
| Hostinger VPS inventory | Read-only | One running Ubuntu 24.04 VPS was visible. |
| Hostinger VPS details | Read-only | VPS exists and is running, but no PostgreSQL service was proven. |
| Hostinger VPS backups | Read-only | At least one VPS backup was present. |
| Hostinger VPS actions | Read-only | VPS creation and backup creation actions were visible. |
| Hostinger Docker Manager | Read-only | Unsupported on the installed OS/runtime. |
| Hostinger websites | Read-only | `gateway.apidevelopers.digital` exists as an enabled Node.js website. |
| Hostinger databases | Read-only | Hosted databases are on port 3306, compatible with MySQL/MariaDB, not PostgreSQL evidence. |
| Hostinger database remote access | Read-only | One hosted database has remote access configured with a broad `%` host pattern. |
| Hostinger Node.js builds | Read-only | Gateway builds use branch `deploy/hostinger-gateway-runtime`, not current `main`. |
| Gateway PHP details | Read-only | PHP PostgreSQL extensions are disabled; Gateway runtime is Node.js, so this is contextual only. |

## 2. Confirmed

| Area | Evidence |
|---|---|
| VPS availability | A running Ubuntu 24.04 VPS exists. |
| VPS backup | At least one VPS backup exists, created on 2026-10-09. |
| Gateway website | `gateway.apidevelopers.digital` is enabled as a Node.js website. |
| Gateway runtime source | Node.js builds for the Gateway use `apidevelopers-digital/apidevelopers-platform`, branch `deploy/hostinger-gateway-runtime`. |
| Latest observed Gateway build | Latest observed build was completed from runtime commit `3b1e2d61...`, with message `deploy(gateway): runtime from 5559826...`. |
| Runtime entrypoint | Hostinger Node.js build uses `src/hostinger-entry.mjs`. |
| Hosted databases | Existing hosting databases are listed on port `3306`. |
| Docker Manager | Hostinger Docker Manager inspection is not supported for the VPS. |
| Remote DB exposure finding | At least one hosted database remote access entry uses a broad `%` host pattern. |

## 3. Inferred

| Inference | Basis |
|---|---|
| Existing hosted databases are not suitable proof of PostgreSQL | They are exposed by Hostinger hosting database inventory on port `3306`, which is consistent with MySQL/MariaDB rather than PostgreSQL. |
| The current Gateway deployment is not proven to contain current Family Data Core v1 work | Hostinger Node.js builds point to `deploy/hostinger-gateway-runtime`, and previous reconciliation showed this runtime branch is a packaged artifact not equivalent to current `main`. |
| The VPS could be a candidate for private PostgreSQL only after separate provisioning/inspection | A VPS exists, but no PostgreSQL service, network posture, TLS, roles, or restore procedure were proven. |
| The broad remote database access pattern is a security concern for future private data work | `%` remote access is not compatible with a strict private-network posture unless separately justified and remediated. |

## 4. Pending

| Gate | Status |
|---|---|
| PostgreSQL engine confirmed | Pending |
| PostgreSQL version confirmed | Pending |
| Private network or allowlist posture | Pending |
| TLS for database client connection | Pending |
| Secret storage location type | Pending |
| Read-only role | Pending |
| Migration role | Pending |
| Database/schema name | Pending |
| Backup policy for PostgreSQL | Pending |
| Restore procedure for PostgreSQL | Pending |
| Observability for PostgreSQL | Pending |
| Audit logging without private family data | Pending |
| Runtime environment variables | Pending |
| Gateway runtime built from current approved source | Pending |
| Rollback artifact | Pending |
| MCP live registration | Pending |
| Bistek ingestion | Pending |

## 5. Blocked

| Activity | Reason |
|---|---|
| Live PostgreSQL probe | No confirmed private PostgreSQL runtime and no explicit approval for a real probe. |
| Schema migration | PostgreSQL runtime, backup/restore, migration role, and rollback are not confirmed. |
| Gateway deploy | Current runtime is not proven to include the Family Data Core v1 stack and deployment approval is absent. |
| MCP live registration | Gateway readiness and authorization boundaries are not deployed and validated. |
| Bistek ingestion | Private runtime and data-governance gates are incomplete. |

## 6. Current GO/NO-GO decision

| Activity | Decision |
|---|---|
| Continue GitHub development in Draft PRs | GO |
| Continue metadata-only readiness/preflight work | GO |
| Collect non-secret evidence | GO |
| Request live probe approval package | Not yet |
| Run live PostgreSQL probe | NO-GO |
| Run migrations | NO-GO |
| Deploy Gateway runtime | NO-GO |
| Register MCP live tool | NO-GO |
| Ingest Bistek data | NO-GO |

## 7. Security notes

- Do not commit database passwords, connection strings, tokens, private keys, raw receipts, storage references, or family records to GitHub.
- Do not treat MySQL/MariaDB hosting databases as PostgreSQL evidence.
- Do not use a broad remote-access pattern as a private database posture.
- Do not assume the Hostinger Gateway runtime reflects `main`.
- Do not use the VPS as PostgreSQL runtime until PostgreSQL, network, TLS, backups, restore, observability, and roles are explicitly confirmed.

## 8. Recommended next action

Block H should prepare a non-secret operator approval package template for a future live PostgreSQL probe.

The approval package should not execute the probe. It should define:

1. target environment category, without secrets;
2. expected PostgreSQL engine/version;
3. allowed runtime source;
4. allowed network path;
5. minimum SQL scope;
6. no private rows or receipt reads;
7. rollback/no-op guarantee;
8. required confirmation literal;
9. exact operator approval wording.

## 9. Current conclusion

Family Data Core v1 remains blocked from production operation by infrastructure evidence gaps.

The development path can continue with metadata-only gates and operator documentation, but the project remains NO-GO for PostgreSQL live probe, migrations, deploy, MCP live registration, and Bistek ingestion.
