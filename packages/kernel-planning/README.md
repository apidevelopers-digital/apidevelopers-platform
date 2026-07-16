# @apidevelopers/kernel-planning

Deterministic advisory planning for the API Developers.digital Institutional Kernel.

## Purpose

This package converts structured reflection or reasoning reports into governed proposals. It does not mutate the Knowledge Graph, approve decisions, or execute actions.

The implementation follows `DE-001 — Deliberation Engine v0.1` and exposes planning terminology while retaining `deliberate()` as a governed alias.

## Public API

```js
import {
  PlanningEngine,
  createPlanningEngine,
  planningPriorities,
} from "@apidevelopers/kernel-planning";

const engine = createPlanningEngine();
const report = engine.plan(reflection, {
  requestedBy: "system",
  scope: "platform",
  objective: "governed-evolution",
  maxProposals: 20,
  context: {},
  impactAnalysis,
});
```

`engine.deliberate(reflection, options)` is an alias of `engine.plan(...)`.

## Output

A planning report includes:

- source reflection identifier and references;
- findings grouped by subject and category;
- deterministic priority;
- rationale and at least two alternatives;
- recommendation;
- required evidence and reviews;
- constitutional conflict status;
- decision state;
- explicit human approval, mutation and execution constraints.

The engine may emit only:

- `proposed`
- `needs-evidence`
- `needs-review`
- `blocked`

## Invariants

1. Advisory mode only.
2. No automatic mutation, approval or execution.
3. Every proposal references its source reflection.
4. High-risk proposals require impact analysis.
5. Missing or expired evidence is explicit.
6. Constitutional conflicts are blocked.
7. Human approval is always required.
8. Stable normalized input produces stable output with an injected stable clock.

## Tests

```bash
npm test -w @apidevelopers/kernel-planning
```

## Version

`0.1.0` — initial governed planning contract.
