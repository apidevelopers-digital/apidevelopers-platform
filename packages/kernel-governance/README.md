# @apidevelopers/kernel-governance

Deny-by-default authorization validation over governed lifecycle artifacts.

## Role

`GovernanceEngine.evaluate()` aggregates existing decisions. It does not reimplement Constitution, Policy, Audit, Evolution or Approval rules.

Required inputs:

- tenant, decision and proposal identifiers;
- Constitution decision;
- Policy decision;
- explicit human Approval;
- Audit report;
- Evolution report.

## Output

The engine returns one of:

- `authorized`
- `needs-review`
- `needs-evidence`
- `blocked`

Even when authorized:

- `mutationAllowed: false`
- `executionAllowed: false`
- an execution gateway remains mandatory.

## Rules

- `GOV-001`: Constitution compliance.
- `GOV-002`: Policy authorization.
- `GOV-003`: human Approval validity and freshness.
- `GOV-004`: Audit and Evidence readiness.
- `GOV-005`: Evolution readiness and lifecycle binding.

## Test

```sh
npm test
```
