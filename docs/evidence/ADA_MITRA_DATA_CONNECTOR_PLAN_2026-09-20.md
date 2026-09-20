# ADA Mitra Data Connector Plan

Date: 2026-09-20
Repository: apidevelopers-digital/apidevelopers-platform
Scope: ADA access to Mitra backend/data capabilities
Operational status: plan only

## Objective

Enable ADA to use Mitra capabilities and connected internal/client databases through the institution backend, without depending on external paid OpenAI API calls for Mitra operations.

The intended path is:

```txt
ADA
-> controlled backend/action bridge
-> institutional Gateway
-> Mitra backend/runtime/facade
-> approved internal or client data sources
-> operational response inside ADA
```

## Explicit decision

This front must not use a public OpenAI API integration as the Mitra backend.

The integration should use institution-owned backend surfaces, controlled Gateway routes, and database connectors when approved.

## Target use cases

Initial ADA requests should be able to ask Mitra-backed questions such as:

- show customer context;
- list or search clients from an approved data source;
- consult financial, campaign, service or task context;
- prepare a client report;
- prepare an operational action in dry-run mode;
- execute a real update only after explicit approval.

## Proposed architecture

```txt
ADA
-> ADA Mitra Bridge
-> Gateway endpoint
-> Mitra backend/facade
-> connector registry
-> database or internal service adapter
```

The bridge should expose controlled endpoints instead of free-form database access.

Candidate endpoints:

```txt
/v1/ada/mitra/status
/v1/ada/mitra/capabilities
/v1/ada/mitra/context
/v1/ada/mitra/connectors
/v1/ada/mitra/query
/v1/ada/mitra/actions/dry-run
/v1/ada/mitra/actions/execute
```

## Connector model

Each database or service connector should define:

- connector id;
- owner/client;
- data source type;
- allowed read operations;
- allowed write operations, if any;
- safety level;
- approval requirements;
- redaction rules;
- audit trail location.

## Security levels

### Level 1: read-only

Allowed examples:

- list clients;
- get client context;
- read campaign state;
- read finance summary;
- generate report from approved fields.

Rules:

- no secrets returned;
- no raw SQL exposed to ADA;
- no unrestricted table dumps;
- pagination and limits required.

### Level 2: dry-run

Allowed examples:

- prepare client update;
- prepare task creation;
- prepare report save;
- validate payload;
- show diff/impact.

Rules:

- no write;
- return planned mutation and impact;
- require explicit approval before execution.

### Level 3: approved execution

Allowed examples:

- create task;
- update controlled client fields;
- register event;
- save report;
- trigger approved workflow.

Rules:

- explicit approval required;
- no secrets in payload;
- audit log required;
- rollback/compensation note when applicable.

## SQL/database policy

ADA must not receive raw direct database access.

Database access should be mediated by controlled backend functions or parameterized route handlers.

Allowed pattern:

```txt
ADA request
-> intent-specific backend endpoint
-> validated parameters
-> parameterized query or repository method
-> redacted response
```

Blocked by default:

```txt
raw SQL from chat
open-ended writes
schema-wide dumps
secret fields
credentials/tokens
unsafe destructive operations
```

## Initial implementation proposal

### PR 1: read-only bridge skeleton

Create a small Gateway-facing bridge with:

```txt
GET /v1/ada/mitra/status
GET /v1/ada/mitra/capabilities
GET /v1/ada/mitra/connectors
```

No database access yet.

### PR 2: first controlled context endpoint

Add:

```txt
POST /v1/ada/mitra/context
```

Return a safe context envelope from registered internal sources.

### PR 3: first database connector

Add one read-only connector with fixed allowed queries and test fixtures.

### PR 4: dry-run/action layer

Add dry-run support before any real mutation.

### PR 5: approved execution gate

Add execute routes only after approval and audit strategy are in place.

## Operational boundaries

- This plan does not deploy anything.
- This plan does not change DNS.
- This plan does not create database credentials.
- This plan does not connect to a live database.
- This plan does not expose secrets.
- This plan does not execute writes.
- Any real connector, database credential, deploy or production exposure requires a separate explicit approval.

## Relationship to Mitra preview success

Mitra preview login is already confirmed working through Gateway Runtime publish #61:

```txt
64fe412b75962f6a0f07c1423cd0b6f11dd64540
```

That validates Mitra access through the institutional Gateway surface, but it does not yet create an ADA backend bridge.

## Readiness checklist for first implementation

Before implementing the first read-only bridge:

- [ ] identify the canonical Gateway module for ADA routes;
- [ ] identify the current pattern used by Zuni/other connectors;
- [ ] define auth/scope required for ADA -> Mitra bridge;
- [ ] define safe response envelope;
- [ ] define logging/audit fields;
- [ ] define initial capabilities list;
- [ ] add tests for no secret exposure;
- [ ] add tests for read-only behavior.

## Recommended next step

Create a first implementation PR for the read-only skeleton only:

```txt
feat(ada): add Mitra bridge read-only status surface
```

Keep this first implementation narrow and safe. Do not connect SQL in the first PR.
