# Family Data Core v1 - Private PostgreSQL GO/NO-GO Checklist

API Developers.digital | 2026-10-11  
Status: operator-facing checklist, evidence-only, no production authorization.

This document defines the minimum evidence required before any real private PostgreSQL connection, live probe, schema migration, runtime deploy, MCP live registration, or Bistek ingestion for Family Data Core v1.

This checklist is not an approval. It is a gate for deciding whether a separate approval request can be prepared.

## 1. Scope

The checklist applies to the Family Data Core v1 runtime path:

```txt
Chat/ADA -> MCP Brain -> Service Hub or Gateway -> Family Data Core -> private PostgreSQL -> authorized consumers
```

The reference tenant remains:

```txt
homosapiens-id
```

The reference logical household dataset remains:

```txt
family.grocery.bistek.v1
```

No raw receipts, storage references, financial details, or private family data should be copied into GitHub public documentation.

## 2. Current decision

| Activity | Decision |
|---|---|
| Validate checklist structure | GO |
| Collect non-secret infrastructure evidence | GO |
| Prepare approval request for live probe | GO, after evidence is complete |
| Execute live PostgreSQL probe | NO-GO |
| Run migrations | NO-GO |
| Deploy Gateway runtime | NO-GO |
| Register MCP live tool | NO-GO |
| Ingest Bistek data | NO-GO |

## 3. Evidence classification

Use these labels in the operator report:

| Label | Meaning |
|---|---|
| Confirmed | Direct evidence exists in GitHub, Hostinger, runtime output, CI, or a controlled operator report. |
| Inferred | Technical conclusion based on evidence, but not directly proven. |
| Pending | Not yet verified. |
| Blocked | Cannot proceed because a dependency or approval is missing. |
| Rejected | Evidence contradicts the requirement. |

## 4. Mandatory evidence before live PostgreSQL probe

| Gate | Required evidence | Status |
|---|---|---|
| PostgreSQL engine | Provider or host confirms PostgreSQL, not MySQL/MariaDB | Pending |
| Private network posture | Database is not openly reachable from the public internet, or has a documented allowlist/private network design | Pending |
| TLS | TLS required or supported for client connection | Pending |
| Connection source | Approved runtime source IP, VPC, host, or controlled tunnel is identified without exposing secrets | Pending |
| Credentials storage | Credentials are stored outside GitHub in an approved secret store or runtime env | Pending |
| Read-only role | A read-only role exists for query/runtime use | Pending |
| Migration role | A separate migration role exists or will be provisioned only for controlled migrations | Pending |
| Database/schema name | Target database and schema are identified without exposing sensitive infrastructure details | Pending |
| Backup | Backup policy exists and is enabled | Pending |
| Restore | Restore procedure is documented or testable | Pending |
| Observability | Logs/metrics/alerts exist without exposing personal data | Pending |
| Audit logging | Operator activity can be traced without logging secrets or private family rows | Pending |
| Rollback | Rollback procedure is documented before migration/deploy | Pending |
| Data minimization | No raw receipts, storage references, or private evidence are exposed to unauthorized consumers | Pending |
| Tenant isolation | `homosapiens-id` scope and household boundary are explicitly enforced | Pending |

## 5. Required non-secret evidence package

Before requesting a live probe, the operator should collect a non-secret evidence package containing:

1. PostgreSQL provider or runtime location.
2. Engine type and major version.
3. Network access model.
4. TLS posture.
5. Backup schedule and retention.
6. Restore method.
7. Runtime secret storage location type, not secret values.
8. Role separation plan.
9. Target schema name.
10. Observability and audit plan.
11. Rollback plan.
12. Authorized approver and exact approval scope.

Do not include:

- passwords;
- tokens;
- connection strings;
- private keys;
- raw receipt files;
- storage references;
- personal family records;
- infrastructure details that would increase exposure.

## 6. Live probe approval boundary

A live probe may be requested only after all mandatory evidence is either Confirmed or explicitly accepted as a documented risk by Igor.

The expected confirmation literal for planning remains:

```txt
FAMILY_DATA_PRIVATE_POSTGRES_PREFLIGHT_APPROVED
```

The literal alone does not authorize migrations, deploy, ingestion, or broad data access.

A live probe approval must state all of the following:

| Field | Required |
|---|---|
| Target environment | Yes |
| Runtime identity | Yes |
| Allowed source | Yes |
| Operation | Read-only connection/preflight only |
| SQL scope | Minimal metadata query only, no private rows |
| Time window | Yes |
| Rollback/no-op statement | Yes |
| Approver | Igor |
| Explicit exclusion | No migrations, no deploy, no ingestion |

## 7. Minimal allowed live-probe scope later

When separately approved, the first real probe should be limited to:

1. establishing a connection;
2. confirming server dialect/version;
3. confirming current database and schema visibility;
4. confirming read-only role;
5. confirming no write privileges for the runtime role;
6. returning only metadata.

It should not read family purchase rows, receipts, financial totals, storage references, or private evidence.

## 8. Migration gate

Migrations remain NO-GO until the live-probe gate is completed and a separate migration plan is approved.

A migration plan must include:

| Requirement | Status |
|---|---|
| SQL diff | Pending |
| Rollback SQL or restore path | Pending |
| Backup snapshot before migration | Pending |
| Migration role identity | Pending |
| Expected table list | Pending |
| Expected column list and types | Pending |
| Post-migration validation | Pending |
| Failure handling | Pending |
| Operator approval | Pending |

## 9. Deploy gate

Deploy remains NO-GO until these are confirmed:

| Requirement | Status |
|---|---|
| Runtime artifact built from current approved SHA | Pending |
| `deploy/hostinger-gateway-runtime` lineage reconciled or replaced | Pending |
| Gateway env variables configured outside GitHub | Pending |
| Health endpoint verified | Pending |
| Family Data readiness endpoint verified | Pending |
| PostgreSQL preflight endpoint verified in dry-run | Pending |
| Rollback artifact available | Pending |
| Post-deploy smoke test plan | Pending |
| Operator approval | Pending |

## 10. MCP live registration gate

MCP live registration remains NO-GO until these are confirmed:

| Requirement | Status |
|---|---|
| Gateway endpoint deployed and healthy | Pending |
| Authorization scopes documented | Pending |
| Household boundary enforced | Pending |
| Chef projection limited to culinary scope | Pending |
| Financial/private data excluded by default | Pending |
| Audit trail available | Pending |
| Operator approval | Pending |

## 11. Bistek ingestion gate

Bistek ingestion is explicitly not the current priority.

It remains NO-GO until:

| Requirement | Status |
|---|---|
| Private PostgreSQL runtime confirmed | Pending |
| Schema migrated and validated | Pending |
| Read-only and migration roles separated | Pending |
| Ingestion role or job identity defined | Pending |
| Source files secured outside public GitHub | Pending |
| Deduplication/replay policy documented | Pending |
| Validation totals defined | Pending |
| Rollback/rebuild procedure defined | Pending |
| Operator approval | Pending |

## 12. GO/NO-GO summary template

Use this template for the next operator report:

```txt
Family Data Core v1 - PostgreSQL Private Runtime GO/NO-GO

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

Percent:
- Family Data Core v1: __% complete / __% remaining / +/-__ p.p.

Next step:
- ...
```

## 13. Current conclusion

The next operational action is not a live probe. The next action is evidence collection for PostgreSQL private runtime readiness.

Until the evidence package is complete and separately approved, the project remains:

```txt
GO: documentation, static code, metadata-only endpoints, dry-run planning
NO-GO: production database connection, migrations, deploy, MCP live registration, Bistek ingestion
```
