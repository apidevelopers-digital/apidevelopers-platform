# @apidevelopers/kernel-orchestration

Deterministic, deny-by-default multi-agent orchestration planner for the API Developers.digital Platform Kernel.

## Scope

The package plans missions and assignments. It does **not** execute agents, tools, deployments or external writes.

The shared contract lives in `@apidevelopers/contracts` and binds:

- strict tenant isolation;
- mission and cycle identity;
- registered agent capabilities;
- assignment dependencies and budgets;
- policy authorization;
- fresh human approval;
- evidence references;
- immutable, traceable plans.

## Invariants

- cross-tenant access is always blocked;
- automatic approval and automatic execution are always blocked;
- a plan may be `ready`, but `executionAllowed` remains `false`;
- missing or invalid policy, approval, evidence or capability produces a blocked plan;
- approval replay is blocked;
- dependency cycles are blocked;
- no external side effect exists in this package.

## Test

```bash
npm test
```
