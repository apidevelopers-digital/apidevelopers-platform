# Architecture Assurance Model

**Status:** canonical candidate  
**Scope:** API Developers.digital platform  
**Branch:** `foundation/global-platform-bootstrap-20260715`  
**Purpose:** convert architectural principles into verifiable controls for parallel development, CI and institutional audit.

## 1. Principle

Architecture is not guaranteed by documentation alone.

Every relevant artifact must be evaluated against machine-verifiable rules before integration.

```text
canonical sources
→ rules
→ validation
→ evidence
→ approval gate
→ integration
```

This model does not replace architectural decisions. It verifies conformance to decisions already accepted.

## 2. Sources of architectural truth

The assurance layer consumes, in priority order:

1. canonical architecture documents;
2. approved ADRs;
3. package public contracts;
4. schemas and registries;
5. repository policies;
6. explicit, versioned exceptions.

Conversation history is not a source of truth.

## 3. Rule categories

### 3.1 Platform identity

Required:

- CLI name: `apid`;
- package namespace: `@apidevelopers/*`;
- central kernels must not use `uni.` as platform identity;
- tenant-specific names must not become platform invariants.

### 3.2 Kernel contract

Every kernel package must expose:

- `package.json`;
- public entry point;
- README;
- tests;
- semantic version;
- owner or responsible domain;
- explicit mutation and execution guarantees.

### 3.3 Execution isolation

Cognitive layers must not execute external actions directly.

```text
reasoning → no execution
planning → no execution
deliberation → no execution
decision → no execution
execution gateway → controlled execution only
```

### 3.4 Institutional boundary

Platform artifacts must remain independent from one specific customer deployment.

Tenant-specific identities, providers, routes, phone numbers, domains and operational roles belong in configuration, adapters, deployments or runbooks.

### 3.5 Documentation integrity

Canonical documents must declare at least:

- title;
- status;
- scope;
- version or revision identity;
- source of truth;
- related artifacts;
- review state.

### 3.6 Traceability

Every architectural validation result must be traceable to:

- repository;
- branch;
- commit SHA;
- rule version;
- analyzed path;
- timestamp;
- result;
- evidence.

## 4. Validation states

| State | Meaning |
|---|---|
| `COMPLIANT` | all mandatory rules passed |
| `CONDITIONAL` | warnings or approved exceptions exist |
| `NON_COMPLIANT` | one or more blocking rules failed |
| `UNKNOWN` | insufficient evidence |
| `BLOCKED` | validation cannot proceed safely |

## 5. Severity levels

| Severity | Effect |
|---|---|
| `INFO` | informational finding |
| `WARN` | correction recommended |
| `ERROR` | integration must stop |
| `CRITICAL` | security or institutional boundary breach |

## 6. Validation lifecycle

```text
artifact produced
→ local validation
→ microcommit
→ CI validation
→ evidence report
→ correction or exception
→ review
→ integration approval
```

Validation must be deterministic whenever inputs are equal.

## 7. Exception process

An exception must never be implicit.

It must include:

- exception ID;
- violated rule;
- justification;
- scope;
- owner;
- approver;
- expiration;
- mitigation;
- follow-up action.

Expired exceptions automatically become non-compliant.

## 8. Evidence model

Minimum report envelope:

```json
{
  "repository": "sitedauni/apidevelopers-platform",
  "branch": "foundation/global-platform-bootstrap-20260715",
  "commitSha": "<sha>",
  "rulesetVersion": "1.0.0",
  "status": "COMPLIANT",
  "findings": [],
  "generatedAt": "<ISO-8601>"
}
```

Reports are evidence, not a second source of architectural truth.

## 9. Initial command contract

Target command:

```bash
apid architecture validate
```

Expected responsibilities:

- discover relevant artifacts;
- load versioned rules;
- validate identity and package contracts;
- validate execution isolation;
- detect tenant leakage into platform artifacts;
- emit human-readable and JSON reports;
- return a non-zero exit code for blocking failures.

## 10. Parallel development rules

Each workstream must record:

- branch;
- base SHA;
- head SHA;
- changed files;
- architectural decisions;
- dependencies;
- shared-contract impact;
- conflict risk;
- next step.

Canonical shared files must have one active owner at a time.

## 11. Adoption roadmap

### Phase 1 — Documentation

- formalize this model;
- inventory existing rules;
- classify mandatory and advisory rules.

### Phase 2 — Schemas

- define ruleset schema;
- define report schema;
- define exception schema.

### Phase 3 — Validator

- implement discovery;
- implement initial rule evaluators;
- expose `apid architecture validate`.

### Phase 4 — CI

- run validator on pull requests;
- store evidence reports;
- block integration on `ERROR` and `CRITICAL`.

### Phase 5 — Portal

- project validation status;
- show findings, exceptions and evidence;
- preserve Git as source of truth.

## 12. Non-goals

This model does not:

- approve architecture automatically;
- merge branches;
- release packages;
- deploy environments;
- execute tenant operations;
- replace human authority where approval is required.

## 13. Definition of done

The assurance model is operational when:

- rules are versioned;
- validation is deterministic;
- CI produces evidence;
- blocking findings stop integration;
- exceptions are explicit and expirable;
- the Portal can display assurance state without becoming a source of truth.
