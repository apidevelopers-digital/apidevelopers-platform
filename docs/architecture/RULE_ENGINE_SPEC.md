# Rule Engine Specification

**Status:** canonical candidate  
**Scope:** API Developers.digital platform  
**Branch:** `foundation/global-platform-bootstrap-20260715`

## 1. Purpose

This document defines the deterministic engine that evaluates repositories against canonical architecture rulesets and produces auditable validation reports and evidence.

Given the same repository revision, normalized configuration, ruleset, exception snapshot, validator version, execution mode, and scope, the engine must produce the same ordered findings, result, hashes, and exit semantics.

The engine must not modify validated source files, silently suppress findings, infer approvals from chat context, expose secrets, or treat unavailable checks as compliant.

## 2. Responsibilities

The engine must:

1. validate input and repository revision;
2. load and validate the canonical ruleset;
3. resolve deterministic scope;
4. load and validate exception snapshots;
5. plan and execute enabled rules;
6. normalize findings;
7. match valid exceptions;
8. calculate the canonical result;
9. generate reports and evidence;
10. return stable exit codes.

It does not approve exceptions, authorize deployments, rewrite code, mutate rulesets, or replace Git and CI as sources of truth.

## 3. Canonical input

```json
{
  "schemaVersion": "1.0.0",
  "repository": {
    "provider": "github",
    "owner": "sitedauni",
    "name": "apidevelopers-platform",
    "branch": "foundation/global-platform-bootstrap-20260715",
    "commitSha": "170f73bcbe0f25af09fb928185b4ec2d64b2fd72",
    "workspacePath": "."
  },
  "ruleset": {
    "path": "architecture/rulesets/architecture-core.json",
    "expectedId": "architecture-core",
    "expectedVersion": "1.0.0"
  },
  "exceptions": {
    "path": "architecture/exceptions/snapshot.json",
    "required": false
  },
  "scope": {
    "mode": "changed-files",
    "baseSha": "8f9d71a12e4e3ca37c9ff4611a52f2a5c7ed320a",
    "headSha": "170f73bcbe0f25af09fb928185b4ec2d64b2fd72",
    "include": ["**"],
    "exclude": ["vendor/**", "dist/**", "node_modules/**"]
  },
  "execution": {
    "mode": "ci",
    "failThreshold": "ERROR",
    "parallelism": 4,
    "timeoutMs": 300000
  },
  "outputs": {
    "directory": "artifacts/architecture",
    "json": true,
    "markdown": true,
    "sarif": true
  }
}
```

Invalid required input produces `INVALID`. A missing optional integration may produce `INCOMPLETE` only when canonical policy explicitly permits partial execution.

## 4. Execution pipeline

The canonical pipeline is:

1. `LOAD_INPUT`
2. `VALIDATE_INPUT`
3. `RESOLVE_REVISION`
4. `LOAD_RULESET`
5. `VALIDATE_RULESET`
6. `RESOLVE_SCOPE`
7. `LOAD_EXCEPTIONS`
8. `PLAN_RULES`
9. `EXECUTE_RULES`
10. `NORMALIZE_FINDINGS`
11. `MATCH_EXCEPTIONS`
12. `CALCULATE_RESULT`
13. `GENERATE_REPORTS`
14. `VERIFY_INTEGRITY`
15. `PUBLISH_ARTIFACTS`
16. `RETURN_EXIT_STATUS`

Every stage records status, duration, warnings, and failures. A failed stage must not be represented as successful.

## 5. Rule contract

Each rule must expose:

```json
{
  "ruleId": "ARC-BOUNDARY-001",
  "ruleVersion": "1.0.0",
  "type": "dependency-boundary",
  "severity": "ERROR",
  "enabled": true,
  "appliesTo": {
    "include": ["apps/**", "packages/**"],
    "exclude": ["**/*.test.*"]
  },
  "parameters": {},
  "message": "Module dependency violates the canonical boundary.",
  "remediation": "Move the dependency behind an approved interface.",
  "sourceRefs": [
    "docs/architecture/CANONICAL_RULESET_SPEC.md"
  ]
}
```

Required properties are stable identity, semantic version, supported type, canonical severity, deterministic applicability, validated parameters, message, remediation, and canonical source references.

## 6. Rule adapter interface

```text
RuleAdapter
  validateDefinition(rule, context) -> ValidationResult
  plan(rule, scope, context) -> RulePlan
  execute(plan, context) -> RawRuleResult
  normalize(rawResult, context) -> Finding[]
```

Adapters must be read-only against the validated source tree, return structured failures, declare external dependencies, support cancellation and timeout, avoid hidden network access, and redact secrets before emitting logs or artifacts.

Initial rule classes may include repository structure, package namespace, dependency direction, forbidden dependency, ownership boundary, required file, forbidden file, manifest field, configuration value, API contract location, ADR reference, security boundary, generated artifact policy, and documentation requirement.

## 7. Scope resolution

Supported modes:

- `repository`
- `changed-files`
- `paths`
- `packages`
- `services`
- `graph-impact`

Resolved files must be repository-relative, normalized, deduplicated, lexicographically sorted, filtered by include and exclude patterns, and preserved in the report manifest.

`changed-files` requires base and head revisions. `graph-impact` requires dependency graph version and hash.

## 8. Planning and execution

Before execution, the engine creates a serializable, hashable plan containing enabled rules, applicable rules, skipped rules and reasons, unsupported rules, targets, execution dependencies, parallel groups, timeout budget, and required external tools.

Parallel execution is allowed only when semantics remain unchanged. Shared mutable state and race-dependent ordering are prohibited. Findings are normalized and sorted after execution.

Rule lifecycle states:

- `DISCOVERED`
- `VALIDATED`
- `PLANNED`
- `RUNNING`
- `COMPLETED`
- `SKIPPED`
- `FAILED`
- `UNSUPPORTED`

`SKIPPED` requires a canonical reason. `UNSUPPORTED` must never become `COMPLETED`.

## 9. Finding normalization

Every finding must conform to `VALIDATION_REPORT_SCHEMA.md`.

Normalization must map tool severity to canonical severity, normalize paths and locations, create stable finding IDs and fingerprints, preserve observed and expected values, attach remediation and source references, reject malformed output, and remove secrets.

Canonical severity order:

1. `INFO`
2. `WARN`
3. `ERROR`
4. `CRITICAL`

Ruleset severity is authoritative. Adapters must not downgrade it.

Malformed rule output makes the rule `FAILED`; canonical policy decides whether the overall result is `INVALID` or `INCOMPLETE`.

## 10. Exception matching

Exception matching occurs only after normalization.

The engine checks status, effective and expiration dates, repository, branch or revision, path, rule, finding fingerprint, owner, approver, and authorization status.

Expired, malformed, revoked, unauthorized, or overbroad exceptions do not cover findings.

Covered findings remain visible with status `EXCEPTED`. The original severity and evidence remain unchanged.

## 11. Result calculation

Precedence:

1. `INVALID` for invalid schemas, integrity failures, unsupported required semantics, or invalid canonical inputs.
2. `INCOMPLETE` when required execution did not finish.
3. `NON_COMPLIANT` when at least one uncovered finding meets the blocking threshold.
4. `CONDITIONAL` when blocking findings exist but every one is covered by a valid exception.
5. `COMPLIANT` when no blocking finding requires an exception.

The published result is immutable. Portal and UI layers must not recalculate it differently.

## 12. Exit codes

| Result | Exit code |
|---|---:|
| `COMPLIANT` | 0 |
| `CONDITIONAL` | 0 by default, policy-overridable |
| `NON_COMPLIANT` | 1 |
| `INVALID` | 2 |
| `INCOMPLETE` | 3 |
| unexpected internal failure before report generation | 4 |

Whenever possible, an internal failure must still generate a minimal `INCOMPLETE` report.

## 13. Determinism and integrity

Canonical ordering:

- rules by `ruleId`, then `ruleVersion`;
- targets by normalized path;
- findings by severity descending, then rule ID, path, line, column, and fingerprint;
- exceptions by `exceptionId`;
- artifacts by name;
- stages by pipeline order.

The engine must hash the normalized input, repository manifest, ruleset snapshot, exception snapshot, execution plan, ordered findings, artifact manifest, and canonical report payload. Recommended algorithm: SHA-256.

A hash mismatch produces `INVALID`.

## 14. Artifacts

The engine should generate:

- `validation-report.json`
- `validation-report.md`
- `validation-report.sarif`
- `execution-plan.json`
- `ruleset.snapshot.json`
- `exceptions.snapshot.json`
- `input.manifest.json`
- `artifacts.manifest.json`
- `engine.log`

The JSON report is canonical. Markdown, HTML, SARIF, and Portal views are projections.

## 15. External validators

External validators must be declared with tool name, supported version, invocation contract, timeout, input and output formats, severity mapping, network requirements, failure policy, and provenance requirements.

Undeclared external execution is prohibited. Shell interpolation of untrusted rule parameters is prohibited.

## 16. Caching

Cache keys must include repository commit or input hash, scope hash, ruleset hash, exception hash, engine version, adapter version, and relevant configuration hash.

Cache hits must be disclosed. Cached findings must pass current schema and integrity validation. A cache must never hide an engine or ruleset version change.

## 17. Timeout and failure handling

The engine supports global timeout, per-rule timeout, cancellation, graceful artifact finalization, and partial-stage recording.

| Failure | Required behavior |
|---|---|
| invalid input or ruleset | `INVALID` |
| unsupported required rule | `INVALID` |
| invalid exception snapshot | `INVALID` |
| rule adapter crash | `INCOMPLETE`, unless policy requires `INVALID` |
| required external tool unavailable | `INCOMPLETE` |
| report hash mismatch | `INVALID` |
| cancellation | canonical result `INCOMPLETE` |

Failures must never be converted into compliance.

## 18. Security controls

The engine must run with least privilege, use read-only access to validated source, restrict output paths, prevent path traversal, validate commands, redact logs, isolate untrusted custom validators, record network usage, preserve tool provenance, and reject executable policy from mutable Portal state.

Reports and logs must not contain credentials, tokens, private keys, passwords, unrestricted environment dumps, unrelated customer data, or unnecessary personal data.

## 19. CI integration

A CI job should:

1. checkout the exact revision;
2. verify repository state;
3. install a pinned engine version;
4. run canonical configuration;
5. upload reports on success and failure;
6. expose a stable summary;
7. set status from the canonical result;
8. preserve evidence references;
9. block protected-branch integration when policy requires.

CI must not alter the result after report generation.

## 20. Portal integration

The Portal may list runs, display results and findings, compare revisions, show exception coverage, link evidence, and display ruleset, engine, and integrity versions.

The Portal must not mutate reports, implicitly approve exceptions, recalculate compliance differently, hide blocking findings, or become the sole evidence repository.

## 21. Versioning and conformance

The engine follows semantic versioning:

- patch: fixes preserving rule semantics and report compatibility;
- minor: backward-compatible capabilities or adapters;
- major: incompatible execution, schema, or result-semantics changes.

A conforming implementation must test deterministic output, stable fingerprints, exception matching, result precedence, exit codes, invalid rulesets, adapter crashes, timeouts, path normalization, ordering, integrity, cache invalidation, secret redaction, read-only behavior, and projection consistency.

Golden fixtures should be versioned with expected canonical reports.

## 22. Reference execution

```text
input = loadInput()
validate(input)

revision = resolveRevision(input.repository)
ruleset = loadAndValidateRuleset(input.ruleset)
scope = resolveScope(input.scope, revision)
exceptions = loadAndValidateExceptions(input.exceptions)

plan = buildPlan(ruleset, scope)
rawResults = executePlan(plany
findings = normalize(rawResults)
findings = applyExceptions(findings, exceptions)

result = calculateResult(findings, rawResults, input.execution)
report = buildCanonicalReport(input, plan, findings, result)

verifyIntegrity(report)
publishArtifacts(report)
exit(mapExitCode(result))
```

## 23. Definition of done

The rule engine becomes operational when:

- versioned input and adapter schemas exist;
- canonical rule classes have parameter schemas;
- deterministic scope resolution is implemented;
- exception matching conforms to the exception model;
- reports conform to `VALIDATION_REPORT_SCHEMA.md`;
- evidence conforms to `ARCHITECTURE_EVIDENCE_MODEL.md`;
- result and exit semantics pass conformance tests;
- CI publishes artifacts on success and failure;
- integrity hashes and secret redaction are tested;
- a reference implementation passes golden fixtures;
- Portal projections remain read-only.
