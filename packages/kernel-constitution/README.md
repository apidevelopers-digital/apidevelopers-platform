# @apidevelopers/kernel-constitution

Versioned constitutional validation for governed API Developers.digital decisions.

## Role

`ConstitutionEngine.evaluate()` evaluates a governed action against a Constitution document supplied as versioned data.

The package does **not** embed product, tenant, legal, health, or commercial rules in code. Constitutional content remains explicit, reviewable and versioned outside the engine.

## Constitution document

A document provides:

- `constitutionId`;
- semantic `version`;
- active status;
- tenant scope;
- deny-by-default or another explicit default effect;
- ordered rules with match criteria, effects and requirements.

Supported rule effects:

- `allow`
- `review`
- `deny`
- `require`

Supported generic match criteria:

- action names;
- domains;
- any or all tags;
- minimum and maximum risk.

Supported requirements:

- authority;
- evidence;
- approval;
- backup;
- rollback.

## Output

The engine emits a frozen `ConstitutionDecision` with:

- tenant, decision and proposal traceability;
- Constitution identifier and version;
- `allow`, `review`, or `deny`;
- matched rule identifiers;
- unmet requirements;
- deterministic reasons;
- `mutationAllowed: false`;
- `executionAllowed: false`.

Policy evaluation, Governance authorization and the Execution Gateway remain mandatory.

## Test

```sh
npm test
```
