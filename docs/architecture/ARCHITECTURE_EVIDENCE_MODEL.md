# Architecture Evidence Model

**Status:** canonical candidate  
**Scope:** API Developers.digital platform  
**Branch:** `foundation/global-platform-bootstrap-20260715`

## 1. Purpose

This document defines the minimum trustworthy evidence contract for architecture validation. Evidence must be versioned, reproducible, auditable, and attributable to an exact repository state, ruleset, validator version, configuration, and exception set.

Evidence is not a screenshot, chat claim, or mutable dashboard state.

## 2. Evidence bundle

Each bundle must contain:

- `evidenceId`
- `schemaVersion`
- `generatedAt`
- `repository`
- `branch`
- `commitSha`
- `baseSha`
- `headSha`
- `rulesetId`
- `rulesetVersion`
- `validatorName`
- `validatorVersion`
- `executionMode`
- `scope`
- `result`
- `findings`
- `exceptions`
- `artifacts`
- `integrity`

## 3. Result states

| Result | Meaning |
|---|---|
| `COMPLIANT` | No blocking findings and no active exception required |
| `CONDITIONAL` | Blocking findings exist but all are covered by valid exceptions |
| `NON_COMPLIANT` | One or more blocking findings are uncovered |
| `INVALID` | Inputs, schemas, or integrity checks are invalid |
| `INCOMPLETE` | Execution ended before required checks completed |

`CONDITIONAL` must never be presented as `COMPLIANT`.

## 4. Reproducibility

A complete bundle records:

- immutable repository and commit references;
- exact ruleset ID and version;
- exact validator name and version;
- normalized configuration;
- deterministic scope;
- exception snapshot;
- execution mode;
- ordered findings;
- content hashes for generated artifacts.

Validation must not depend on hidden conversation state or uncaptured mutable remote content.

## 5. Finding evidence

Each finding must contain:

- stable `findingId`;
- `ruleId`;
- severity and status;
- affected path;
- optional line and column;
- observed value;
- expected value;
- human-readable message;
- remediation guidance;
- canonical source references;
- matched exception reference when applicable;
- deterministic fingerprint.

A finding fingerprint should be derived from stable normalized fields:

```text
ruleId
+ normalized path
+ normalized location
+ normalized observed value
+ ruleset major version
```

## 6. Exception evidence

When a finding is covered by an exception, the bundle must preserve:

- original finding severity and evidence;
- `exceptionId`;
- owner and approver;
- effective and expiration dates;
- scope-match result;
- validation status.

The original finding remains visible with status `EXCEPTED`.

## 7. Execution metadata

The bundle should record start and finish timestamps, duration, runtime platform, CI provider and run ID, command arguments, allowlisted environment metadata, changed files, exit code, warnings, and internal errors.

Secrets, credentials, tokens, private keys, passwords, and raw environment dumps are prohibited.

## 8. Artifacts

Evidence artifacts may include:

- human-readable report;
- JSON report;
- SARIF report;
- dependency graph snapshot;
- ruleset snapshot;
- exception snapshot;
- validator logs;
- manifest of checked files.

Each artifact must declare name, media type, path, SHA-256, and byte size. Published artifacts are immutable.

## 9. Integrity

The `integrity` section must hash:

- normalized input manifest;
- ruleset snapshot;
- exception snapshot;
- ordered findings;
- generated artifacts;
- complete evidence payload excluding the final bundle hash.

A hash mismatch makes the bundle `INVALID`.

## 10. Storage and retention

Evidence may be stored in the repository, CI artifact storage, or external immutable storage, provided commit and integrity references remain available.

Evidence must be retained for:

- every protected-branch integration;
- every release candidate and release;
- every failed architecture gate;
- every exception approval, revocation, and expiration;
- every major ruleset or validator migration.

Deletion must be explicit, authorized, and auditable.

## 11. Run comparison

Comparison across runs should identify:

- new findings;
- resolved findings;
- unchanged findings;
- severity changes;
- exception changes;
- ruleset changes;
- scope changes;
- validator changes.

Differences in inputs and tooling must be disclosed.

## 12. CI contract

CI must:

- generate evidence for every architecture validation;
- preserve evidence on success and failure;
- expose a stable artifact reference;
- fail according to configured severity thresholds;
- never modify the validated source tree;
- never fabricate a successful bundle after an internal error.

A validator crash produces `INCOMPLETE`, not `COMPLIANT`.

## 13. Portal projection

The Portal may display the current result, commit, branch, versions, findings by severity, exception coverage, run comparison, artifact references, and integrity status.

The Portal is a projection layer. Git, CI, and versioned evidence remain authoritative.

## 14. Security and privacy

Evidence must not contain secrets, unrelated customer data, or unnecessary personal data. Redacted fields must be explicitly marked while preserving enough structure for verification.

## 15. Non-goals

This model does not approve exceptions, authorize deployments, change canonical rules, replace ADRs, execute remediation, or define tenant business policy.

## 16. Definition of done

The model is operational when:

- a JSON Schema exists;
- the validator emits conforming bundles;
- fingerprints are deterministic;
- exception snapshots are immutable;
- artifact hashes are verified;
- CI retains bundles on success and failure;
- run comparison is available;
- the Portal projects evidence without mutating it.
