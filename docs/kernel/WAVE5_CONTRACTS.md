# Wave 5 Governed Lifecycle Contracts

Status: integration baseline  
Branch: `foundation/global-platform-bootstrap-20260715`

## Scope

This document records the shared contract used by:

1. `@apidevelopers/kernel-constitution`
2. `@apidevelopers/kernel-policy`
3. `@apidevelopers/kernel-audit`
4. `@apidevelopers/kernel-evolution`
5. `@apidevelopers/kernel-governance`

The lifecycle is advisory and deny-by-default. No package in this chain performs
external execution.

## Canonical lifecycle identifiers

| Meaning | Canonical field |
|---|---|
| Tenant | `tenantId` |
| Decision | `decisionId` |
| Selected proposal | `proposalId` |
| Execution plan | `planId` |
| Planning report | `planningId` |
| Constitution decision | `constitutionDecisionId` |
| Policy decision | `policyDecisionId` |
| Human approval | `approvalId` |
| Audit report | `auditId` |
| Evolution report | `evolutionId` |
| Runtime report | `reportId` |

`planId` identifies an execution plan. `planningId` identifies the upstream
Planning report. They are related but are not aliases.

## ConstitutionDecision

Required integration fields:

- `constitutionDecisionId`
- `tenantId`
- `decisionId`
- `proposalId`
- `constitutionId`
- `constitutionVersion`
- `effect`: `allow | review | deny`
- `mutationAllowed: false`
- `executionAllowed: false`

## PolicyDecision

Required integration fields:

- `policyDecisionId`
- `tenantId`
- `decisionId`
- `proposalId`
- `planHash`
- `effect`: `allow | deny`
- `mutationAllowed`
- `executionAllowed`

Policy may authorize mutation or execution for the downstream runtime, but does
not execute by itself.

## Approval

Required integration fields:

- `approvalId`
- `tenantId`
- `decisionId`
- `proposalId`
- `status: approved`
- `approvedBy`
- replay protection through absence of `consumedAt`, `used`, or `replayed`

## AuditReport

Required integration fields:

- `auditId`
- `tenantId`
- `status`
- `subject.decisionId`
- `subject.planId`
- `checks`
- `evidence`
- `mutationAllowed: false`
- `executionAllowed: false`

Audit accepts a governed bundle containing Decision, Plan, Policy, Approval,
Runtime and Evidence.

## EvolutionReport

Required integration fields:

- `evolutionId`
- `sourceAuditId`
- `sourceAuditStatus`
- `status`: `stable | changes-proposed | blocked-by-evidence`
- `proposals`
- advisory constraints prohibiting automatic mutation, approval and execution

## GovernanceReport

Required integration fields:

- `governanceId`
- `tenantId`
- `decisionId`
- `proposalId`
- `status`: `authorized | needs-review | needs-evidence | blocked`
- `authorized`
- `references.constitutionDecisionId`
- `references.policyDecisionId`
- `references.approvalId`
- `references.auditId`
- `references.evolutionId`
- `mutationAllowed: false`
- `executionAllowed: false`
- `constraints.executionGatewayRequired: true`

## Precedence

Governance applies the following safety precedence:

1. constitutional or policy denial -> `blocked`
2. lifecycle identifier mismatch -> `blocked`
3. missing approval, audit or evolution evidence -> `needs-evidence`
4. audit attention or proposed evolution -> `needs-review`
5. all checks pass -> `authorized`

`authorized` is not execution. An execution gateway remains mandatory.

## Compatibility notes

- Do not rename public fields during Wave 5 integration.
- Use explicit adapters at package boundaries when a legacy artifact uses a
  different identifier.
- Keep `planId` and `planningId` distinct.
- Keep `reportId` as the Runtime report identifier; do not overload it as
  `auditId`.
- New shared schemas should adopt the canonical fields in this document.
- Legacy shims must re-export canonical implementations and must not contain
  business logic.

## Integration evidence

The integration test
`tests/integration/kernel-constitutional-governance.test.mjs` proves:

- a coherent Constitution -> Policy -> Audit -> Evolution -> Governance cycle
  produces `authorized`;
- constitutional `deny` prevails and produces `blocked`;
- no package in the chain directly executes or mutates external state.
