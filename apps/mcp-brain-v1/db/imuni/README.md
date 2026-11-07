# Imuni Clinical DB v1

Status: design/staging package. Production clinical writes remain blocked.

## Purpose

This package defines the first PostgreSQL schema for storing Imuni patients and clinical encounters under medical supervision.

It is designed for Igor's clinical workflow, but it must not be used with real patient data until the R5 gates are approved.

## Current rule

```text
clinical_writes_enabled: false
production_writes_enabled: false
```

## Database engine

Recommended engine:

```text
PostgreSQL
```

Deployment target for staging/dev:

```text
VPS: srv2028303.hstgr.cloud
Path: /opt/api-dev-brain/apps/imuni-clinical-db-v1
```

## Why not reuse the existing Hostinger MySQL staging DB?

The Hostinger account already has MySQL databases for Imuni staging/stage2, but the clinical database should be isolated on the VPS with PostgreSQL because:

- healthcare records need stricter audit design;
- PostgreSQL has stronger schema, JSONB, RLS and extension support;
- the service can be kept private on the Docker network;
- future encrypted backups and app-scoped credentials are easier to govern.

## Data classification

```text
clinical_sensitive
```

## Tables

- `imuni.tenants`
- `imuni.practitioners`
- `imuni.patients`
- `imuni.patient_consents`
- `imuni.access_grants`
- `imuni.encounters`
- `imuni.clinical_notes`
- `imuni.attachments`
- `imuni_audit.events`

## Security posture

The schema uses:

- encrypted payload fields for patient and clinical content;
- hashes for lookup fields where possible;
- no raw clinical narrative in audit events;
- append-style audit event table;
- row-level security enabled;
- separate `imuni` and `imuni_audit` schemas.

## Not allowed yet

- real patient persistence;
- production migration;
- public database port;
- logging raw clinical text;
- autonomous diagnosis;
- autonomous prescription;
- clinical write tools marked REAL.

## R5 gates before real clinical data

- LGPD review;
- professional identity and CRM/UF gate;
- patient/responsible consent or legal basis;
- access control by tenant/practitioner/patient;
- encryption/key policy;
- encrypted backup policy;
- audit retention policy;
- correction/amendment policy;
- staging test with synthetic data;
- explicit R5 approval.