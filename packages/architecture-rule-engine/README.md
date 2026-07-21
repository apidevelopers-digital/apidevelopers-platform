# @apidevelopers/architecture-rule-engine

Deterministic, read-only runtime for evaluating canonical architecture rulesets and generating authoritative JSON validation reports.

## Implemented surface

The package provides:

- canonical input validation and stable result semantics;
- deterministic rule planning, finding normalization and SHA-256 report integrity;
- explicit exception matching;
- in-memory and filesystem repository adapters;
- versioned ruleset and exception loaders;
- the validation service used by `apid architecture validate`;
- built-in read-only adapters for:
  - `required-path`
  - `required-field`
  - `allowed-value`
  - `required-pattern`
  - `forbidden-pattern`
  - `export-contract`

## Export contract

`export-contract` validates package manifests selected by `appliesTo`.

Supported parameters:

```json
{
  "requiredKeys": ["."],
  "requireExistingTargets": true,
  "allowNullTargets": false
}
```

The adapter accepts root string exports and conditional export objects. Export targets must be package-relative (`./...`), remain inside the package directory and, by default, resolve to existing files. Wildcard targets are intentionally unsupported in this first deterministic version.

## Guarantees

- read-only evaluation of validated source files;
- normalized repository-relative paths;
- deterministic target and finding order;
- no hidden network access;
- no secret content emitted in findings;
- stable exit codes for `COMPLIANT`, `CONDITIONAL`, `NON_COMPLIANT`, `INVALID` and `INCOMPLETE`;
- canonical report integrity verification.

## Commands

From the package directory:

```bash
npm run check
npm test
```

From the repository root:

```bash
node scripts/apid.mjs architecture validate
```

## Current boundary

The runtime does not approve exceptions, mutate validated source files, merge branches, deploy environments or grant CI authorization. CI and Portal layers may consume the canonical report but must not recalculate its result.
