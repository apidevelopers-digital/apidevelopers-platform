# @apidevelopers/kernel-audit

Read-only lifecycle audit engine for governed API Developers.digital artifacts.

## Contract

`AuditEngine.audit(bundle, options)` evaluates the consistency of:

- tenant;
- Decision record;
- governed Plan;
- Policy decision;
- human Approval;
- Runtime report;
- Evidence records.

The engine is advisory only. It does not mutate inputs, approve, decide, execute, publish, deploy, or write to external systems.

## Rules

- `AUD-001`: lifecycle traceability across Decision, Plan, Policy and Runtime.
- `AUD-002`: human authority and automatic execution prohibitions.
- `AUD-003`: Approval binding, freshness and replay protection.
- `AUD-004`: Runtime mode, Policy effect and step consistency.
- `AUD-005`: Evidence activity and optional integrity verification.

## Statuses

- `compliant`
- `attention`
- `non-compliant`
- `insufficient-evidence`

## Usage

```js
import { createAuditEngine } from "@apidevelopers/kernel-audit";

const audit = createAuditEngine({
  clock: () => "2026-07-17T01:00:00.000Z",
  verifyEvidence: (record) => record.integrity?.algorithm === "sha256",
});

const report = audit.audit({
  tenantId: "tenant_001",
  decision,
  plan,
  policyDecision,
  approval,
  runtimeReport,
  evidence,
});
```

## Invariants

- `mode: "advisory"`
- `mutationAllowed: false`
- `executionAllowed: false`
- human authority required
- traceability required
- deterministic output with an injected clock

## Test

```sh
npm test
```
