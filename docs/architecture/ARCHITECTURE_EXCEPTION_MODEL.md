# Architecture Exception Model

**Status:** canonical candidate  
**Scope:** API Developers.digital platform  
**Branch:** `foundation/global-platform-bootstrap-20260715`  
**Purpose:** define how temporary, explicit and auditable exceptions may coexist with architecture assurance without weakening canonical rules.

## 1. Principle

An exception is not a rule change.

It is a time-bounded authorization to tolerate one known non-conformity under explicit ownership, evidence and mitigation.

```text
rule violation
→ explicit exception request
→ authority review
→ scoped authorization
→ conditional validation state
→ expiration or remediation
```

Exceptions must never silently convert a non-compliant artifact into a compliant one.

## 2. Required fields

Every exception must declare:

- `exceptionId`
- `title`
- `status`
- `ruleIds`
- `scope`
- `justification`
- `owner`
- `approver`
- `createdAt`
- `effectiveFrom`
- `expiresAt`
- `mitigations`
- `remediationPlan`
- `evidenceRefs`
- `reviewCadence`
- `replacementRefs`

Example:

```yaml
exceptionId: EXC-ARCH-0001
title: Temporary compatibility bridge for legacy planning engine
status: active
ruleIds:
  - ARC-KERNEL-004
scope:
  include:
    - scripts/lib/planning-engine.mjs
justification: >
  The legacy module remains temporarily available while consumers migrate
  to @apidevelopers/kernel-planning.
owner: kernel-migration
approver: platform-architecture
createdAt: 2026-07-21
effectiveFrom: 2026-07-21
expiresAt: 2026-08-15
mitigations:
  - no new consumers may import the legacy path
  - all new capabilities must use the package export
remediationPlan:
  - migrate remaining consumers
  - remove compatibility export
  - retire the legacy file
evidenceRefs:
  - docs/architecture/CANONICAL_RULESET_SPEC.md
reviewCadence: weekly
replacementRefs:
  - packages/kernel-planning
```

## 3. Lifecycle

Allowed states:

| State | Meaning |
|---|---|
| `draft` | prepared but not authorized |
| `pending-review` | awaiting approval |
| `active` | authorized and within validity |
| `expiring` | close to expiration |
| `expired` | no longer valid |
| `revoked` | withdrawn before expiration |
| `remediated` | underlying violation removed |
| `rejected` | authorization denied |

Only `active` exceptions affect validation.

## 4. Authorization model

An exception requires two distinct responsibilities:

- **owner:** accountable for mitigation and remediation;
- **approver:** authority allowed to accept the temporary architecture risk.

For `ERROR` or `CRITICAL` findings, owner and approver should not be the same identity.

Approval must be explicit, traceable and tied to the exact exception version. Conversation history alone is not approval evidence.

## 5. Scope

Exception scope must be narrow and reproducible.

Supported targets include:

- repository;
- directory;
- package;
- file;
- exported API;
- dependency edge;
- finding fingerprint;
- commit range.

Broad wildcard scope is prohibited unless the approver records why a narrower scope is impossible.

An exception must not suppress unrelated findings produced by the same rule.

## 6. Rule relationship

An exception references one or more stable rule IDs.

It must not:

- rewrite the rule;
- change rule severity;
- hide the original finding;
- remove evidence;
- mark the repository as fully compliant.

When all blocking findings are covered by valid exceptions, the validation state becomes `CONDITIONAL`, never `COMPLIANT`.

## 7. Severity constraints

| Rule severity | Exception behavior |
|---|---|
| `INFO` | normally unnecessary |
| `WARN` | may be authorized by domain owner |
| `ERROR` | requires architecture authority |
| `CRITICAL` | requires architecture and security authority; may be non-exceptionable |

Rules may declare:

```yaml
exceptionPolicy:
  allowed: false
```

A non-exceptionable rule always remains blocking.

## 8. Expiration

Every active exception must have `expiresAt`.

Permanent exceptions are prohibited.

At expiration:

1. the exception becomes `expired`;
2. covered findings return to their original severity;
3. validation becomes blocking when applicable;
4. CI must not renew the exception automatically.

Renewal creates a new reviewed version and requires fresh evidence.

## 9. Mitigation and remediation

Mitigation reduces immediate risk while the exception is active.

Remediation removes the underlying violation.

Both are mandatory for `ERROR` and `CRITICAL` findings.

A remediation plan should include:

- tasks;
- responsible owner;
- dependencies;
- target date;
- completion evidence.

## 10. Evidence

Minimum evidence includes:

- canonical rule source;
- exact affected artifact;
- observed non-conformity;
- reason immediate remediation is not viable;
- risk assessment;
- mitigation proof;
- approval record;
- expiration date;
- remediation progress.

Evidence references should be immutable where possible, preferably commit SHAs, versioned documents or CI artifacts.

## 11. Validation behavior

For each finding and candidate exception, the validator must verify:

1. exception schema is valid;
2. status is `active`;
3. evaluation time is inside the authorized window;
4. rule ID matches;
5. scope matches exactly;
6. approver is authorized for the severity;
7. evidence references are present;
8. the rule permits exceptions.

Results:

| Condition | Result |
|---|---|
| no matching exception | original finding |
| valid matching exception | finding retained with status `EXCEPTED` |
| invalid exception | original finding plus exception error |
| expired exception | original finding plus expiration warning |
| overbroad exception | original finding plus scope error |

## 12. Finding representation

An excepted finding remains visible:

```json
{
  "findingId": "ARC-KERNEL-004:scripts/lib/planning-engine.mjs",
  "ruleId": "ARC-KERNEL-004",
  "severity": "ERROR",
  "status": "EXCEPTED",
  "path": "scripts/lib/planning-engine.mjs",
  "exception": {
    "exceptionId": "EXC-ARCH-0001",
    "expiresAt": "2026-08-15",
    "owner": "kernel-migration",
    "approver": "platform-architecture"
  }
}
```

## 13. CI behavior

CI must:

- validate exception schemas;
- reject unauthorized or malformed exceptions;
- warn before expiration;
- fail when a blocking exception expires;
- preserve original finding severity;
- publish exception coverage in evidence reports;
- never auto-approve, auto-renew or widen scope.

Recommended warning windows:

- 14 days before expiration;
- 7 days before expiration;
- 1 day before expiration.

## 14. Repository layout

Recommended structure:

```text
architecture/
└── exceptions/
    ├── README.md
    ├── active/
    │   └── EXC-ARCH-0001.yaml
    ├── history/
    │   └── EXC-ARCH-0000.yaml
    └── schemas/
        └── exception.schema.json
```

Moving a record to history must preserve its full authorization and remediation trail.

## 15. Portal projection

The Portal may display:

- active exceptions;
- covered rules and findings;
- owner and approver;
- remaining validity;
- mitigations;
- remediation progress;
- expiration warnings;
- historical decisions.

The Portal is a projection layer and must not become the source of truth for authorization.

## 16. Audit requirements

Every exception transition must record:

- exception ID;
- previous state;
- new state;
- actor;
- timestamp;
- reason;
- source commit;
- evidence references.

Audit history must be append-only.

## 17. Non-goals

This model does not:

- approve exceptions automatically;
- change canonical architecture decisions;
- waive security controls silently;
- authorize deployment;
- authorize tenant operations;
- replace ADRs;
- replace human authority.

## 18. Definition of done

The exception model becomes operational when:

- an exception JSON Schema exists;
- repository storage conventions exist;
- validators match findings to exact scopes;
- expiration is enforced;
- CI reports invalid and expiring exceptions;
- evidence reports preserve original findings;
- the Portal can project exception state;
- no exception can produce a false `COMPLIANT` result.
