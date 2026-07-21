# Validation Report Schema

**Status:** canonical candidate  
**Scope:** API Developers.digital platform  
**Branch:** `foundation/global-platform-bootstrap-20260715`  
**Purpose:** define the canonical machine-readable and human-readable contract for architecture validation reports.

## 1. Principle

A validation report is the authoritative projection of one validator execution.

It must be deterministic, auditable, portable across CI providers, and explicit about:

- what was evaluated;
- which rules were applied;
- which findings were produced;
- which exceptions were matched;
- what result was calculated;
- which evidence artifacts were generated;
- whether the report itself is trustworthy.

A report must never hide blocking findings or convert a conditional state into a compliant state.

## 2. Canonical top-level structure

Every report must contain:

- `schemaVersion`
- `reportId`
- `generatedAt`
- `repository`
- `revision`
- `execution`
- `ruleset`
- `scope`
- `summary`
- `findings`
- `exceptions`
- `artifacts`
- `integrity`

Recommended shape:

```json
{
  "schemaVersion": "1.0.0",
  "reportId": "arch-report-20260721-bdeff902",
  "generatedAt": "2026-07-21T02:00:00Z",
  "repository": {},
  "revision": {},
  "execution": {},
  "ruleset": {},
  "scope": {},
  "summary": {},
  "findings": [],
  "exceptions": [],
  "artifacts": [],
  "integrity": {}
}
```

## 3. Repository and revision

`repository` identifies the validated source:

```json
{
  "owner": "sitedauni",
  "name": "apidevelopers-platform",
  "fullName": "sitedauni/apidevelopers-platform",
  "provider": "github"
}
```

`revision` identifies the exact Git state:

```json
{
  "branch": "foundation/global-platform-bootstrap-20260715",
  "commitSha": "bdeff90243c14332135abdad554ba162a1461cb6",
  "baseSha": "111d218039a0cc04325a15a0295cdf9a9c949ef3",
  "headSha": "bdeff90243c14332135abdad554ba162a1461cb6",
  "dirty": false
}
```

A report over a dirty worktree must declare `dirty: true` and include the normalized diff hash.

## 4. Execution metadata

`execution` must include:

- `validatorName`
- `validatorVersion`
- `mode`
- `startedAt`
- `finishedAt`
- `durationMs`
- `exitCode`
- `ciProvider`
- `ciRunId`
- `command`
- `environment`
- `status`

Allowed execution status values:

- `COMPLETED`
- `FAILED`
- `INCOMPLETE`
- `CANCELLED`

Secrets, credentials, tokens, private keys, passwords, and raw environment dumps are prohibited.

## 5. Ruleset metadata

`ruleset` must include:

- `rulesetId`
- `rulesetVersion`
- `schemaVersion`
- `source`
- `sourceCommit`
- `ruleCount`
- `enabledRuleCount`
- `hash`

Example:

```json
{
  "rulesetId": "architecture-core",
  "rulesetVersion": "1.0.0",
  "schemaVersion": "1.0.0",
  "source": "architecture/rulesets/architecture-core.json",
  "sourceCommit": "bdeff90243c14332135abdad554ba162a1461cb6",
  "ruleCount": 42,
  "enabledRuleCount": 40,
  "hash": "sha256:..."
}
```

## 6. Scope

`scope` must identify exactly what was evaluated:

```json
{
  "mode": "changed-files",
  "include": ["docs/architecture/**"],
  "exclude": ["vendor/**", "dist/**"],
  "resolvedFiles": ["docs/architecture/ARCHITECTURE_EVIDENCE_MODEL.md"],
  "resolvedFileCount": 1,
  "changedFiles": ["docs/architecture/ARCHITECTURE_EVIDENCE_MODEL.md"]
}
```

Scope resolution must be deterministic and ordered.

## 7. Summary

`summary` must contain:

- `result`
- `findingCount`
- `openFindingCount`
- `exceptedFindingCount`
- `suppressedFindingCount`
- `countsBySeverity`
- `countsByStatus`
- `countsByRule`
- `blockingThreshold`
- `blockingFindingCount`

Allowed report results:

- `COMPLIANT`
- `CONDITIONAL`
- `NON_COMPLIANT`
- `INVALID`
- `INCOMPLETE`

Result rules:

1. `INVALID` when the report, ruleset, exception set, or integrity checks are invalid.
2. `INCOMPLETE` when required checks did not finish.
3. `NON_COMPLIANT` when at least one blocking finding is uncovered.
4. `CONDITIONAL` when blocking findings exist but all are covered by valid exceptions.
5. `COMPLIANT` only when no blocking finding requires an exception.

## 8. Finding schema

Each finding must include:

- `findingId`
- `fingerprint`
- `ruleId`
- `ruleVersion`
- `severity`
- `status`
- `message`
- `path`
- `location`
- `observed`
- `expected`
- `remediation`
- `sourceRefs`
- `exception`
- `metadata`

Allowed severity values:

- `INFO`
- `WARN`
- `ERROR`
- `CRITICAL`

Allowed finding status values:

- `OPEN`
- `EXCEPTED`
- `RESOLVED`
- `SUPPRESSED`
- `INVALID`

`SUPPRESSED` is reserved for canonical rule behavior, not ad hoc hiding of findings.

Example:

```json
{
  "findingId": "ARC-ID-001:package.json:2",
  "fingerprint": "sha256:...",
  "ruleId": "ARC-ID-001",
  "ruleVersion": "1.0.0",
  "severity": "ERROR",
  "status": "OPEN",
  "message": "Use the canonical platform package namespace.",
  "path": "package.json",
  "location": {
    "line": 2,
    "column": 3
  },
  "observed": "@uni/example",
  "expected": "@apidevelopers/*",
  "remediation": "Rename the package and update consumers.",
  "sourceRefs": [
    "docs/architecture/CANONICAL_RULESET_SPEC.md"
  ],
  "exception": null,
  "metadata": {}
}
```

## 9. Exception projection

When a finding is excepted, its original severity and evidence remain unchanged.

The finding must include:

```json
{
  "exception": {
    "exceptionId": "EXC-ARCH-0001",
    "status": "ACTIVE",
    "owner": "kernel-migration",
    "approver": "platform-architecture",
    "effectiveFrom": "2026-07-21",
    "expiresAt": "2026-08-15",
    "scopeMatched": true,
    "ruleMatched": true
  }
}
```

The top-level `exceptions` array contains the normalized exception snapshots used by the run.

Expired, malformed, unauthorized, or overbroad exceptions must not produce `EXCEPTED` findings.

## 10. Artifact references

Each artifact must declare:

- `name`
- `mediaType`
- `path` or immutable external reference
- `sha256`
- `size`
- `purpose`

Example:

```json
{
  "name": "architecture-report.sarif",
  "mediaType": "application/sarif+json",
  "path": "artifacts/architecture-report.sarif",
  "sha256": "sha256:...",
  "size": 18240,
  "purpose": "code-scanning"
}
```

## 11. Integrity

`integrity` must include hashes for:

- normalized report payload;
- input manifest;
- ruleset snapshot;
- exception snapshot;
- ordered findings;
- artifact manifest.

Example:

```json
{
  "algorithm": "sha256",
  "report": "sha256:...",
  "inputManifest": "sha256:...",
  "ruleset": "sha256:...",
  "exceptions": "sha256:...",
  "findings": "sha256:...",
  "artifacts": "sha256:..."
}
```

A hash mismatch makes the report `INVALID`.

## 12. Deterministic ordering

To make reports comparable:

- findings are ordered by severity rank, rule ID, normalized path, location, and fingerprint;
- exceptions are ordered by exception ID;
- artifacts are ordered by name;
- object keys should be serialized consistently;
- timestamps are ISO 8601 UTC;
- paths use `/`;
- empty optional collections use `[]` or `{}` consistently.

## 13. Human-readable report

A Markdown or HTML projection should contain:

1. overall result;
2. repository and revision;
3. execution details;
4. ruleset and scope;
5. severity summary;
6. blocking findings;
7. exception coverage;
8. remediation guidance;
9. artifact and integrity references.

The human-readable projection must be generated from the canonical machine-readable report and must not introduce new facts.

## 14. SARIF projection

A SARIF projection may be generated for code-scanning integrations.

Requirements:

- preserve canonical `ruleId`;
- preserve finding severity semantics;
- include the finding fingerprint;
- include source location when available;
- include remediation guidance;
- preserve exception state in properties;
- never downgrade a blocking finding merely to satisfy a consumer format.

The canonical JSON report remains authoritative.

## 15. CI behavior

CI must:

- generate the canonical JSON report on every architecture validation;
- publish it on success and failure;
- generate human-readable and optional SARIF projections;
- set exit status from the canonical result and configured blocking threshold;
- preserve report artifacts for the configured retention period;
- refuse to publish `COMPLIANT` after validator crashes or integrity failures.

Recommended exit mapping:

| Result | Exit code |
|---|---:|
| `COMPLIANT` | 0 |
| `CONDITIONAL` | 0 or policy-defined warning code |
| `NON_COMPLIANT` | 1 |
| `INVALID` | 2 |
| `INCOMPLETE` | 3 |

## 16. Portal projection

The Portal may display reports and comparisons but must not mutate canonical reports.

It may project:

- current result;
- counts by severity and status;
- blocking findings;
- exception expiration;
- trend across commits;
- new and resolved findings;
- artifact references;
- integrity status.

Git, CI artifacts, and immutable evidence remain authoritative.

## 17. Versioning

`schemaVersion` follows semantic versioning:

- patch: clarifications or additive optional fields;
- minor: additive backward-compatible required behavior with migration support;
- major: incompatible structural or semantic changes.

Consumers must reject unsupported major versions explicitly.

## 18. Privacy and security

Reports must not include:

- secrets or credentials;
- raw tokens;
- private keys;
- passwords;
- unrestricted environment dumps;
- unrelated customer data;
- unnecessary personal data.

Redaction must be explicit and deterministic.

## 19. Failure handling

| Failure | Required report result |
|---|---|
| invalid ruleset schema | `INVALID` |
| invalid exception schema | `INVALID` |
| validator crash | `INCOMPLETE` |
| artifact hash mismatch | `INVALID` |
| unsupported rule type | `INVALID` or explicit policy warning |
| optional external dependency unavailable | `INCOMPLETE` or disclosed partial result |

A failure must never be represented as `COMPLIANT`.

## 20. Definition of done

The schema becomes operational when:

- a JSON Schema exists;
- validator output conforms to it;
- deterministic ordering is implemented;
- integrity hashes are verified;
- exception projections preserve original findings;
- Markdown and SARIF projections are generated from canonical JSON;
- CI publishes reports on success and failure;
- unsupported major versions are rejected;
- Portal projections remain read-only.
