# Export Contract Rollout Baseline

**Ruleset:** `architecture-core@1.1.0`  
**Rule:** `ARC-PKG-003`  
**Mode:** active, non-blocking (`WARN`)  
**Source revision:** `f8f87b613edfe3e62fe427eebf44ebffde286566`

## Decision

`export-contract` is enabled as a baseline warning before becoming blocking.

The controlled repository projection produced 39 open warnings. Every warning had the same cause: the package manifest does not declare the root export key `"."`.

No unsafe export path, escaped package target or missing declared target was observed in the package that already declares `exports`.

## Verified report

- Result: `COMPLIANT`
- Findings: `39`
- Blocking findings: `0`
- Rule count: `6`
- Report ID: `arch-report-f8f87b613edf-f8909092ab28`
- Report integrity: `sha256:a8089c8ace5d98e0978af38a44be7ed216632b1f5788cb489e85c4e02a983d63`
- Integrity verification: `true`

## Rollout policy

1. Keep `ARC-PKG-003` at `WARN`.
2. Add explicit root exports package by package.
3. Require every target to remain package-relative and exist.
4. Track the warning count until it reaches zero.
5. Promote the rule to `ERROR` only after a fresh verified repository report has zero findings.

## Current boundary

The baseline report was generated from an immutable semantic projection of the files observed by the active rules. It is authoritative for the six-rule ruleset over that projection, but it is not a substitute for a complete checkout-based CI run.

No exception was created for these warnings. The open items are remediation work, not approved deviations.
