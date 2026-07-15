# AP Audit

Status: Foundation v1
Owner: API Developers.digital
Maturity: L1 -> L2

## Mission

Provide an immutable, queryable and tenant-scoped audit trail for sensitive and operational actions across the platform.

## Responsibilities

- record actions performed by users, service accounts and automated processes;
- preserve evidence of who did what, when, where and with which result;
- correlate audit records with requests, events and resources;
- enforce tenant isolation and retention policies;
- support secure search and export;
- integrate with AP Events, AP Auth, AP Tenancy and AP Guard.

## Out of scope

- application logs;
- provider secrets or raw credentials;
- product analytics;
- mutable business records.

## Canonical fields

- audit_id
- tenant_id
- principal_id
- request_id
- correlation_id
- action
- resource_type
- resource_id
- result
- risk_level
- occurred_at
- metadata

## Permanent rules

1. Audit records are append-only.
2. No secret or raw credential may be stored.
3. Sensitive actions must always generate audit evidence.
4. Cross-tenant audit access is denied by default.
5. Retention and export follow risk and legal policies.
6. Audit evidence does not replace domain events or operational logs.

## Completion criteria

- architecture documented;
- contracts versioned;
- executable package created;
- immutable storage strategy defined;
- tenant isolation tested;
- sensitive actions covered;
- search and export policies defined;
- event and observability hooks implemented.
