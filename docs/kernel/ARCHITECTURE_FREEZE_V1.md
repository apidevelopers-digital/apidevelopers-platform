# Architecture Freeze v1

Status: ACTIVE  
Platform: API Developers.digital  
Branch baseline: `foundation/global-platform-bootstrap-20260715`  
Baseline commit: `9808cfd30b5f54e13c9e6254bb08e2595c671dba`

## Purpose

This document freezes the current kernel architecture so the platform can consolidate contracts,
identifiers, registry, events and observability before any new kernel package is introduced.

The freeze does not block bug fixes, tests, documentation, compatibility shims, adapters or
integration work inside the approved scope.

## Frozen institutional pipeline

1. Knowledge Graph
2. Ontology
3. Memory
4. Reasoning
5. Planning
6. Decision
7. Execution Gateway
8. Audit
9. Reflection
10. Evolution

Governance, Constitution and Policy are cross-cutting controls over the lifecycle. They do not
replace the pipeline stages and do not execute external actions directly.

## Frozen packages

The approved package surface is:

- `@apidevelopers/contracts`
- `@apidevelopers/kernel-memory`
- `@apidevelopers/kernel-reasoning`
- `@apidevelopers/kernel-planning`
- `@apidevelopers/kernel-decision`
- `@apidevelopers/kernel-policy`
- `@apidevelopers/kernel-runtime`
- `@apidevelopers/kernel-evidence`
- `@apidevelopers/kernel-reflection`
- `@apidevelopers/kernel-audit`
- `@apidevelopers/kernel-evolution`
- `@apidevelopers/kernel-governance`
- `@apidevelopers/kernel-constitution`

No new kernel package may be created while this freeze is active.

## Frozen responsibilities

### Contracts

Owns versioned shared contracts and explicit adapters. It must not contain business policy,
automatic execution or silent aliases.

### Constitution

Evaluates versioned constitutional data and emits `allow`, `review` or `deny`. It does not
approve, mutate or execute.

### Policy

Evaluates operational rules and may authorize or deny downstream runtime capability. It does not
execute by itself.

### Governance

Aggregates Constitution, Policy, human Approval, Audit and Evolution into a formal readiness
decision. `authorized` is not execution.

### Execution Gateway

The only layer allowed to initiate external mutation after all controls pass. It remains mandatory
and separate from Decision, Policy and Governance.

### Audit

Records what happened and validates lifecycle integrity.

### Reflection

Explains what was learned. It is advisory only.

### Evolution

Proposes what should change in the system. It is advisory only.

## Canonical identifiers

Canonical identifier families must use a stable dotted namespace:

- `capability.<name>`
- `component.<domain>.<name>`
- `contract.<name>.v<major>`
- `policy.<domain>.<name>`
- `decision.<time-or-sequence>`
- `planning.<time-or-sequence>`
- `plan.<time-or-sequence>`
- `approval.<time-or-sequence>`
- `audit.<time-or-sequence>`
- `reflection.<time-or-sequence>`
- `evolution.<time-or-sequence>`
- `governance.<time-or-sequence>`

Existing public identifiers remain compatible until explicit adapters are available. Silent
renaming is prohibited.

## Canonical contract distinction

- `planningId` identifies a Planning report.
- `planId` identifies an Execution plan.
- `reportId` identifies a Runtime report.
- `auditId` identifies an Audit report.

These fields are not aliases.

## Mandatory invariants

- deny by default;
- explicit human approval for sensitive actions;
- no automatic approval;
- no automatic external execution;
- no external mutation outside the Execution Gateway;
- immutable inputs for advisory engines;
- tenant, decision and proposal traceability;
- replay protection for approvals;
- versioned public contracts;
- deterministic outputs where a fixed clock and stable input are supplied;
- CI evidence before a package is marked TESTED or INTEGRATED.

## Allowed work during the freeze

1. fix existing package defects;
2. add or improve tests;
3. consolidate shared contracts;
4. create explicit adapters;
5. standardize canonical identifiers;
6. implement the central Registry;
7. implement shared Event Envelope contracts;
8. implement common Observability contracts;
9. document architecture and compatibility;
10. remove duplicate legacy logic after compatibility evidence;
11. prepare pull requests for review.

## Blocked work during the freeze

- creation of new kernel packages;
- invention of new public interfaces without a versioned contract;
- duplicated business logic in `scripts/lib`;
- silent field aliases;
- direct execution from Planning, Decision, Constitution, Policy, Governance, Audit, Reflection or Evolution;
- merge, deploy or release without explicit human approval.

## Freeze exit criteria

The freeze may be lifted only when all criteria are satisfied:

1. `@apidevelopers/contracts` is stable in local and remote CI;
2. canonical ID validation is implemented and tested;
3. one central Registry exists for components, capabilities, contracts, policies and versions;
4. shared event contracts exist for at least:
   - `MemoryRecorded`
   - `DecisionCreated`
   - `PlanGenerated`
   - `ExecutionRequested`
   - `ExecutionBlocked`
5. common observability contracts include:
   - `traceId`
   - package/component identity
   - version
   - start/end or duration
   - status
   - tenant and decision references where applicable
6. the governed end-to-end lifecycle remains green in CI;
7. architecture documentation and compatibility notes are current;
8. a human reviewer explicitly approves lifting the freeze.

## Current execution order

1. canonical ID contract and validator;
2. central Registry;
1. Event Envelope;
4. Observability Envelope;
5. integration across the frozen pipeline;
6. architecture review;
7. pull request preparation.

## Evidence baseline

The Contracts adapter was validated with 13/13 local tests and remote CI:

- Contracts CI run `29548174801`: success
- Platform CI run `29548174826`: success

This freeze is architectural guidance and does not authorize merge, deploy or release.
