# Rule Engine — Implementation Learnings

**Status:** active implementation record  
**Scope:** `@apidevelopers/architecture-rule-engine`  
**Branch:** `foundation/global-platform-bootstrap-20260715`

This record captures implementation failures that changed the delivery process. It does not replace the canonical architecture specifications.

## 2026-07-21 — Mixed nullish and logical operators

### Failure

The first version of `scripts/architecture-validate.mjs` used `??` and `||` in the same expression without explicit grouping:

```js
const branch = configuredBranch ?? detectedBranch || "detached";
```

Node.js rejected the file during syntax validation.

### Cause

JavaScript intentionally disallows mixing nullish coalescing with logical OR or AND without parentheses because the intended precedence is ambiguous.

### Correction

The fallback was made explicit:

```js
const branch = configuredBranch ?? (detectedBranch || "detached");
```

### Prevention

Every new executable module must pass `node --check` before repository publication. CLI routing tests must execute the help path so syntax failures in delegated scripts are detected.

## 2026-07-21 — Binary comparison false positive

### Failure

A local-to-remote comparison reported a two-byte difference in `src/adapters.mjs`, while the GitHub blob remained structurally valid.

### Cause

The comparison used raw local bytes without first normalizing line endings and without treating the Git blob SHA as the authoritative remote identity.

### Correction

The remote blob was reread and its content verified before any rewrite.

### Prevention

Use both checks:

1. GitHub blob SHA for remote identity;
2. normalized UTF-8 content comparison for text equivalence.

A raw byte count difference alone is not evidence of corruption.

## Operational rule

A failed check is converted into one of three durable controls:

- a deterministic automated test;
- a pre-publication validation step;
- a documented invariant when automation is not yet available.
