# @apidevelopers/kernel-evolution

Deterministic, advisory evolution proposals derived from governed audit reports.

## Contract

`EvolutionEngine.propose(auditReport, options)` receives a completed audit report and returns:

- traceability to `sourceAuditId`;
- deterministic remediation, evidence-collection, or review proposals;
- priorities and preconditions;
- explicit human-approval and evidence constraints;
- no mutation, approval, or execution capability.

## Statuses

- `stable`
- `changes-proposed`
- `blocked-by-evidence`

## Invariants

- `mode: advisory`
- `mutationAllowed: false`
- `executionAllowed: false`
- `automaticApprovalAllowed: false`
- `humanApprovalRequired: true`
- `evidenceRequiredBeforePromotion: true`

## Test

```sh
npm test
```
