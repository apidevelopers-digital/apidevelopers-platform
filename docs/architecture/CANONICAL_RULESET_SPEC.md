# Canonical Ruleset Specification

**Status:** canonical candidate  
**Scope:** API Developers.digital platform  
**Branch:** `foundation/global-platform-bootstrap-20260715`  
**Purpose:** define the versioned contract for architecture rules consumed by validators, CI, evidence reports and the Portal.

## 1. Principle

A ruleset is an executable representation of already accepted architectural decisions.

It does not create policy by itself. It encodes policy from canonical documents, approved ADRs, public package contracts and repository governance.

```text
canonical source
→ normalized rule
→ versioned ruleset
→ deterministic evaluation
→ evidence report
```

## 2. Ruleset identity

Every ruleset must declare:

- `rulesetId`
- `name`
- `version`
- `status`
- `scope`
- `sourceRefs`
- `effectiveFrom`
- `owner`
- `defaultSeverity`
- `rules`

Example:

```yaml
rulesetId: architecture-core
name: Architecture Core Rules
version: 1.0.0
status: active
scope: platform
effectiveFrom: 2026-07-21
owner: platform-architecture
defaultSeverity: ERROR
sourceRefs:
  - docs/architecture/ARCHITECTURE_ASSURANCE_MODEL.md
rules: []
```

## 3. Rule contract

Every rule must contain:

- stable `id`
- human-readable `title`
- unambiguous `description`
- `category`
- `severity`
- lifecycle `status`
- evaluated `scope`
- canonical `sourceRefs`
- machine-evaluable `assertion`
- failure `message`
- `remediation`

Example:

```yaml
id: ARC-ID-001
title: Platform CLI name
description: The official platform CLI must be named apid.
category: platform-identity
severity: ERROR
status: active
scope:
  include:
    - scripts/**
    - packages/**
  exclude:
    - docs/tenants/**
sourceRefs:
  - docs/architecture/ARCHITECTURE_ASSURANCE_MODEL.md
assertion:
  type: forbidden-pattern
  patterns:
    - "\buni\s"
message: Use apid as the platform CLI.
remediation: Move tenant-specific naming to tenant scope.
```

## 4. Stable identifiers

Rule identifiers are immutable:

```text
<domain>-<category>-<sequence>
```

Examples:

- `ARC-ID-001`
- `ARC-KERNEL-001`
- `ARC-EXEC-001`
- `DOC-META-001`
- `TENANT-BOUNDARY-001`

Retired identifiers must never be reused.

## 5. Initial categories

| Category | Responsibility |
|---|---|
| `platform-identity` | CLI, namespaces and platform naming |
| `kernel-contract` | package structure and public guarantees |
| `execution-isolation` | separation between cognition and execution |
| `institution-boundary` | prevention of tenant leakage |
| `documentation-integrity` | metadata, references and review state |
| `traceability` | repository, branch, SHA and evidence linkage |
| `security` | prohibited secrets and unsafe operations |
| `compatibility` | version and migration constraints |
| `internationalization` | locale-independent platform contracts |
| `tenancy` | institutional isolation requirements |

## 6. Assertion types

The first validator implementation should support:

- `required-path`
- `required-field`
- `required-pattern`
- `forbidden-pattern`
- `allowed-value`
- `json-schema`
- `dependency-direction`
- `export-contract`
- `test-presence`
- `source-reference`
- `custom-evaluator`

Custom evaluators must be deterministic, versioned and identified in evidence reports.

## 7. Severity

| Severity | Default behavior |
|---|---|
| `INFO` | report only |
| `WARN` | report and continue |
| `ERROR` | block integration |
| `CRITICAL` | block immediately and require explicit review |

Changing severity requires a ruleset version change and a canonical source reference.

## 8. Rule lifecycle

Allowed statuses:

- `draft`
- `active`
- `deprecated`
- `retired`
- `suspended`

Rules:

- `draft` rules do not block
- `active` rules follow configured severity
- `deprecated` rules remain evaluable and include replacement guidance
- `retired` rules remain in history but are not evaluated
- `suspended` rules require an explicit, expirable exception record

## 9. Determinism

Given the same repository tree, commit SHA, ruleset version, validator version and configuration, evaluation must return the same ordered findings.

Rules must not depend on conversation state, unversioned remote content or nondeterministic network calls.

## 10. Finding contract

Every advisory or failed evaluation emits:

```json
{
  "findingId": "ARC-ID-001:packages/example/package.json",
  "ruleId": "ARC-ID-001",
  "severity": "ERROR",
  "status": "OPEN",
  "path": "packages/example/package.json",
  "location": { "line": 2, "column": 3 },
  "message": "Use @apidevelopers/* as the platform package namespace.",
  "evidence": {
    "observed": "@uni/example",
    "expected": "@apidevelopers/*"
  },
  "sourceRefs": [],
  "remediation": "Rename the package."
}
```

Findings must be stable enough to compare validation runs.

## 11. Exceptions

Exceptions are external to the ruleset and must include:

- exception ID
- rule ID
- exact scope
- justification
- owner
- approver
- creation date
- expiration date
- mitigation
- evidence link

An exception never changes a result to `COMPLIANT`; it produces `CONDITIONAL`.

## 12. Versioning

Rulesets use semantic versioning:

- major: incompatible rule semantics or report contract
- minor: new backward-compatible rules or assertion types
- patch: clarification or bug fix without intended evaluation change

Every report records the exact ruleset version.

## 13. Recommended repository layout

```text
architecture/
├── rulesets/
│   ├── architecture-core.v1.yaml
│   ├── kernel-contracts.v1.yaml
│   └── documentation-integrity.v1.yaml
├── schemas/
│   ├── ruleset.schema.json
│   ├── rule.schema.json
│   ├── finding.schema.json
│   └── exception.schema.json
└── exceptions/
    └── README.md
```

## 14. Validation command

Target command:

```bash
apid architecture validate
```

Minimum options:

```text
--ruleset <path|id>
--format human|json
--scope <path>
--base <sha>
--head <sha>
--fail-on WARN|ERROR|CRITICAL
--exceptions <path>
```

The command must be read-only by default.

## 15. Initial mandatory rules

The first active ruleset should cover:

1. platform CLI is `apid`
2. platform packages use `@apidevelopers/*`
3. kernel packages contain manifest, public entry point, README and tests
4. cognitive kernels do not import execution adapters
5. tenant-specific names do not become platform invariants
6. canonical documents expose required metadata
7. reports include branch, commit SHA and ruleset version
8. secrets and credentials are not committed

## 16. CI contract

CI must:

- load versioned rulesets from the repository
- validate their schemas
- evaluate changed and impacted artifacts
- publish human-readable and JSON reports
- return non-zero for blocking findings
- preserve reports as evidence
- never auto-approve an exception

## 17. Portal projection

The Portal may display ruleset version, compliance status, findings by severity, impacted artifacts, exceptions and validation history.

Git and versioned evidence remain the sources of truth.

## 18. Non-goals

This specification does not approve architecture changes, execute remediation automatically, merge branches, publish releases or deploy environments.

## 19. Definition of done

This specification becomes operational when:

- schemas exist
- at least one versioned ruleset exists
- the validator produces deterministic findings
- CI stores evidence
- blocking rules stop integration
- exceptions are explicit and expirable
- the Portal can project validation state without owning it
