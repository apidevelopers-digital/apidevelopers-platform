# @apidevelopers/kernel-reasoning

Deterministic and explainable institutional reasoning over Knowledge Graph snapshots.

## Purpose

This package detects structural inconsistencies and produces auditable conclusions. It does not mutate the graph, approve decisions, or execute actions.

## Public API

```js
import {
  ReasoningEngine,
  createReasoningEngine,
} from "@apidevelopers/kernel-reasoning";

const engine = createReasoningEngine();
const report = engine.infer(snapshot, {
  scope: "platform",
  requestedBy: "system",
});
```

## Initial rules

- `RSN-001`: active Capability without an implementing Component.
- `RSN-002`: active Component without a referenced Contract.
- `RSN-003`: circular dependency.
- `RN-004`: active Policy without a target.
- `RSN-005`: unresolved placeholder node.

## Output

Each conclusion includes:

- rule identifier;
- severity;
- subject;
- statement;
- premises;
- recommendation;
- confidence;
- deterministic mode.

## Invariants

1. Read-only operation.
2. No automatic decisions.
3. No automatic execution.
4. Every conclusion must be explainable by premises.
5. Identical normalized input produces deterministic validation.
6. The Knowledge Graph remains the source of truth.

## Tests

```bash
npm test -w @apidevelopers/kernel-reasoning
```

## Version

`0.1.0`1 - initial deterministic rule set.
