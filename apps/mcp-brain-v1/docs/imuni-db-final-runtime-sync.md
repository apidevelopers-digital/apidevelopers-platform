# Imuni DB MCP v1 — Final Runtime Patch Sync

Date: 2026-11-07
PR: #739
Runtime: `/opt/api-dev-brain/apps/mcp-brain-v1`
Database runtime: `/opt/api-dev-brain/apps/imuni-clinical-db-v1`
DB container: `imuni-postgres`
MCP container: `mcp-api`

## Final runtime state verified on VPS

The Imuni clinical database staging/dev layer is active and verified.

Verified tools:

```text
imuni.db.status
imuni.db.schema.check
imuni.db.synthetic.counts
imuni.db.synthetic.seed
```

Final observed results:

```text
imuni.db.status: ok:true
imuni.db.schema.check: ok:true
tables_found_count: 9
missing_tables: []
unexpected_tables: []
row_level_security_enabled_all: true
stream_clean_patch_version: v3

imuni.db.synthetic.counts: ok:true
synthetic_counts:
  tenants: 1
  practitioners: 1
  patients: 1
  encounters: 1
  audit_events: 1
stream_clean_patch_version: synthetic-counts-v2
```

## Patches consolidated in runtime

### 1. Docker socket transport

The first DB read-only implementation tried to use Docker CLI from inside `mcp-api`. It failed to see `imuni-postgres`.

Final runtime uses the Docker Engine Unix socket API:

```text
/var/run/docker.sock
```

No secret value, DSN or arbitrary SQL is exposed.

### 2. Schema stream cleaning v3

Docker exec over the socket can prefix the first stdout frame with non-table characters, previously observed as:

```text
�imuni.access_grants
```

Final parser extracts only expected schema-qualified substrings:

```text
imuni.
imuni_audit.
```

Final patch marker:

```text
stream_clean_patch_version: v3
```

### 3. Synthetic counts stream cleaning v2

Docker exec stream artifacts previously produced:

```text
Atenants
```

Final parser normalizes synthetic count keys:

```text
tenants
practitioners
patients
encounters
audit_events
```

Final patch marker:

```text
stream_clean_patch_version: synthetic-counts-v2
```

### 4. Synthetic staging write tool

`imuni.db.synthetic.seed` writes only synthetic data and is gated by:

```text
synthetic_ack: true
confirmacao: IGOR_APROVA_R5
```

It creates:

- synthetic tenant
- synthetic practitioner
- synthetic patient
- synthetic consent
- synthetic access grant
- synthetic encounter
- synthetic clinical note
- synthetic audit event

The audit event does not store raw clinical narrative.

## Safety invariants

These remain mandatory:

```text
staging_only: true
synthetic_only: true
clinical_writes_enabled: false
production_writes_enabled: false
no_real_patient_persistence: true
no_secret_exposure: true
no_dsn_exposure: true
no_clinical_payload_exposure: true
no_sql_arbitrary: true
```

## Files changed on VPS

Primary runtime file:

```text
/opt/api-dev-brain/apps/mcp-brain-v1/app/tools/imuni_tools.py
```

Relevant backups:

```text
/opt/api-dev-brain/apps/mcp-brain-v1/app/tools/imuni_tools.py.bak.20261107030901
/opt/api-dev-brain/apps/mcp-brain-v1/app/tools/imuni_tools.py.bak.20261107031135
/opt/api-dev-brain/apps/mcp-brain-v1/app/tools/imuni_tools.py.bak.20261107031303
/opt/api-dev-brain/apps/mcp-brain-v1/app/tools/imuni_tools.py.bak.20261107031501
/opt/api-dev-brain/apps/mcp-brain-v1/app/tools/imuni_tools.py.bak.20261107031739
```

## Registry records

```text
registry/operations/imuni-clinical-db-v1-staging.json
registry/operations/imuni-db-mcp-readonly-v1.json
registry/operations/imuni-db-synthetic-write-v1.json
```

## PR reconciliation status

This document records the final verified VPS runtime state in source control.

Remaining source-control work:

1. Replace the current monolithic `apps/mcp-brain-v1/app/tools/imuni_tools.py` in this PR with a clean modular source layout.
2. Add `imuni_base_tools.py` and `imuni_db_tools.py`.
3. Expand tests to cover:
   - Docker stream prefix cleaning;
   - synthetic counts key normalization;
   - seed blocking without `synthetic_ack`;
   - seed blocking without `IGOR_APROVA_R5`;
   - successful synthetic seed with synthetic counters.
4. Keep this PR as draft until CI passes and review confirms no secret, `.env`, DSN or real clinical payload is included.

## Real patient writes

Still blocked.

Before real patient persistence:

- LGPD review;
- professional identity/CRM gate;
- consent or legal basis model;
- RBAC/RLS policies bound to app roles;
- encryption/key policy;
- encrypted backup policy;
- correction/amendment policy;
- explicit R5 approval for real clinical persistence.
