# @apidevelopers/kernel-decision

Advisory decision-readiness evaluation for the API Developers.digital Institutional Kernel.

## Purpose

This package consumes governed planning reports, evaluates evidence and review gates, and recommends the next human decision step.

It never approves a proposal, mutates institutional state, or executes an action.

## Public API

```js
import {
  DecisionEngine,
  createDecisionEngine,
  decisionStates,
} from "@apidevelopers/kernel-decision";

const engine = createDecisionEngine();
const report = engine.evaluate(planningReport, {
  requestedBy: "system",
  scope: "platform",
  selectedProposalId,
  evidence: [],
  reviews: [],
});
```

## Decision readiness states

- `no-candidate`
- `blocked`
- `needs-evidence`
- `needs-review`
- `ready-for-human-decision`

`ready-for-human-decision` is not approval. The output keeps `approved: false` and requires an explicit human gate.

## Output

A decision report includes:

- planning and reflection traceability;
- deterministically ordered candidates;
- selected proposal identifier;
- readiness state and advisory recommendation;
- missing evidence and reviews;
- constitutional conflict status;
- explicit human approval, mutation and execution constraints.

## Invariants

1. Advisory mode only.
2. No automatic decision, approval, mutation or execution.
3. Constitutional conflicts remain blocked.
4. Evidence and review gaps are explicit.
5. Every candidate preserves source references.
6. Input planning reports are never mutated.
7. Stable normalized input produces stable output with an injected stable clock.

## Tests

```bash
npm test -w @apidevelopers/kernel-decision
```

## Version

`0.1.0` — initial decision-readiness contract.
