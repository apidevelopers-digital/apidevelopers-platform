# @apidevelopers/kernel-reflection

Advisory reflection engine for governed knowledge snapshots in API Developers.digital.

## Contract

`ReflectionEngine.analyze(snapshot, options)` returns a deterministic reflection report containing:

- `reflectionId` and `generatedAt`;
- request scope and requester;
- advisory mode;
- `mutationAllowed: false`;
- severity counts;
- explainable findings and recommendations.

The engine does not mutate the snapshot, approve changes, make decisions, or execute actions.

## Rules

- `REF-001`: orphan node;
- `REF-002`: capability without Asset;
- `REF-003`: Asset without Evidence;
- `REF-004`: active Organization without Solution.

## Usage

```js
import { createReflectionEngine } from "@apidevelopers/kernel-reflection";

const engine = createReflectionEngine({
  clock: () => "2026-07-17T00:00:00.000Z",
});

const report = engine.analyze({
  nodes: [],
  relations: [],
});
```

## Test

```sh
npm test
```
