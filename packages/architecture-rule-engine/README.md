# @apidevelopers/architecture-rule-engine

Deterministic, read-only core for evaluating canonical architecture rulesets and generating the authoritative JSON validation report.

## Initial delivery

This package implements the first executable unit described by:

- `docs/architecture/ARCHITECTURE_ASSURANCE_MODEL.md`
- `docs/architecture/CANONICAL_RULESET_SPEC.md`
- `docs/architecture/ARCHITECTURE_EXCEPTION_MODEL.md`
- `docs/architecture/ARCHITECTURE_EVIDENCE_MODEL.md`
- `docs/architecture/VALIDATION_REPORT_SCHEMA.md`
- `docs/architecture/RULE_ENGINE_SPEC.md`

The versioned schemas live in:

```text
architecture/schemas/v1/
  rule-engine-input.schema.json
  validation-report.schema.json
```

## Guarantees

- validates canonical input before execution;
- blocks unsafe relative paths and secret-like fields;
- plans enabled rules in stable identity order;
- executes only explicitly supplied in-memory adapters;
- normalizes and sorts findings deterministically;
- preserves blocking findings covered by valid exceptions as `EXCEPTED`;
- calculates `COMPLIANT`, `CONDITIONAL`, `NON_COMPLIANT`, `INVALID` and `INCOMPLETE`;
- emits stable exit semantics;
- generates a canonical report with SHA-256 integrity;
- never writes to the validated source tree;
- performs no network, Git, CI or Portal mutation.

## API

```js
import {
  runRuleEngine,
  validateEngineInput,
  calculateResult,
  verifyValidationReport,
} from "@apidevelopers/architecture-rule-engine";
```

`runRuleEngine(input, runtime)` receives a canonical input plus an in-memory ruleset, exact exception snapshot, deterministically resolved files and explicit rule adapters.

## Current boundary

This delivery intentionally does not:

- discover files from Git;
- load rulesets from disk;
- publish artifacts;
- expose `apid architecture validate`;
- add or modify CI workflows;
- integrate with the Portal.

Those capabilities belong to subsequent, independently testable units.
