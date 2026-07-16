# DE-001 — Deliberation Engine v0.1

**Status:** Draft for implementation  
**Authority:** API Developers.digital Institutional Kernel  
**Scope:** Cognitive governance  
**Mutation:** Prohibited

## 1. Purpose

The Deliberation Engine converts structured reflections into governed proposals.

It does not execute changes, approve decisions, or mutate the Institutional Knowledge Graph.

## 2. Inputs

- Reflection report
- Optional context package
- Optional impact analysis
- Request metadata: scope, requester, objective

## 3. Outputs

A deliberation report containing:

- grouped findings;
- priority;
- rationale;
- alternatives;
- recommendation;
- required evidence;
- required reviews;
- decision state;
- source references.

## 4. Invariants

1. No automatic mutation.
2. No automatic approval.
3. Every proposal must reference its source reflection.
4. High-risk proposals require impact analysis.
5. Missing evidence must be explicit.
6. Constitutional conflicts must be marked as blocked.
7. Human approval is required before evolution.
8. Output must be deterministic for identical normalized input.

## 5. Priority model

Priority is derived from the highest finding severity:

- critical
- high
- medium
- low
- info

Priority may be increased when:

- multiple findings affect the same subject;
- more than one Organization is impacted;
- the proposal affects Kernel invariants;
- provider replacement risk exists;
- evidence is absent or expired.

## 6. Alternatives

Every proposal must contain at least two alternatives:

1. corrective action;
2. temporary acceptance with explicit owner, expiry and risk record.

A third alternative may retire or archive the affected element.

## 7. Decision states

- proposed
- needs-evidence
- needs-review
- blocked
- approved
- rejected

The Deliberation Engine may only emit:

- proposed
- needs-evidence
- needs-review
- blocked

## 8. Constitutional gate

A proposal is blocked when it:

- permits Organization-specific capture of the Kernel;
- bypasses Evidence before Promotion;
- allows unreviewed autonomous mutation;
- weakens tenant isolation;
- introduces secrets into source, logs or graph nodes;
- removes traceability.

## 9. Minimal public contract

```js
deliberate(reflection, options) => deliberationReport
```

Options:

```js
({
  requestedBy,
  scope,
  objective,
  maxProposals
}
```

## 10. Minimal tests

1. Reject invalid reflection input.
2. Group findings by subject and category.
3. Preserve the source reflection identifier.
4. Sort proposals by priority.
5. Require human approval.
6. Mark missing evidence.
7. Block constitutional conflicts.
8. Never mutate the graph or reflection input.
9. Produce stable output for stable input.
10. Enforce the maximum number of proposals.

## 11. Definition of done

v0.1 is complete when:

- the public contract is implemented;
- all minimal tests pass;
- the engine runs in advisory mode only;
- output can be consumed by the future Decision Engine;
- no graph mutation path exists.
