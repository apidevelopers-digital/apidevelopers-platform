# @apidevelopers/kernel-audit

Read-only lifecycle audit engine for the API Developers.digital Platform Kernel.

## Contract

`AuditEngine.audit(bundle, options)` evaluates the consistency of:

- tenant and cycle context;
- governed Decision;
- governed Plan;
- Policy decision;
- human Approval;
- Runtime report;
- append-only Evidence records.

The engine is advisory only. It does not mutate inputs, approve, decide, execute,
publish, deploy, or write to external systems.

## Rules

- `AUD-001`: lifecycle traceability across Decision, Plan, Policy, Runtime and Evidence.
- `AUD-002`: human authority and automatic approval/execution prohibitions.
- `AUD-003`: approval binding, freshness and replay protection.
- `AUD-004`: Runtime mode, Policy effect and observed step consistency.
- `AUD-005`: Evidence activity, tenant/cycle isolation and integrity verification.

## Statuses

- `compliant`
- `attention`
- `non-compliant`
- `insufficient-evidence`

## Governed handoff

`runGovernedAudit()` consumes the canonical immutable handoff:

`kernel-evidence -> kernel-audit`

It verifies the source SHA-256 evidence digest before producing a deeply immutable
governed audit report.

## Invariants

- `mode: "advisory"`
- `mutationAllowed: false`
- `executionAllowed: false`
- human authority required
- traceability required
- evidence integrity required
- tenant and cycle isolation required
- cross-tenant access prohibited

## Test

```sh
npm run check
```
