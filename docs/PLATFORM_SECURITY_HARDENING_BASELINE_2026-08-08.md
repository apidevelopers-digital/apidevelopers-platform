# Platform Security Hardening Baseline — 2026-08-08

**Repository:** `apidevelopers-digital/apidevelopers-platform`  
**Base:** `main` at `c906953ceab603f7fa898a4788853c7edc1064c8`  
**Status:** candidate hardening baseline; no repository setting is changed by this document.

## Confirmed current state

- repository visibility: public;
- `main` has no native branch-protection rule;
- secret scanning: disabled;
- secret scanning push protection: disabled;
- Dependabot security updates: disabled;
- automated security validity checks: disabled;
- `Platform Baseline CI` is green on the current `main`;
- `Site Factory Hostinger Node Contract Monitor` false-positive drift was fixed by PR #155 and merged into current `main`.

## Risk interpretation

The current control plane is operational but repository hardening is incomplete.

Absence of native protection or GitHub security features must not be described as enabled. Until native controls are available and approved, the minimum compensating controls are:

1. development only on work branches;
2. review through pull requests;
3. green applicable CI before merge;
4. explicit approval for merge;
5. exact head SHA recorded before merge;
6. readback of `main` after merge;
7. post-merge baseline CI evidence;
8. no force-push or destructive branch cleanup as a substitute for governance;
9. no secrets in Git;
10. production writes remain separately approval-gated.

## Hardening target

Priority order:

1. enable secret scanning where supported;
2. enable push protection where supported;
3. enable Dependabot security updates where supported;
4. enable dependency/security validity checks where supported;
5. apply native branch protection / rulesets when plan and repository settings permit;
6. define required checks from current stable CI contexts;
7. validate harmless PR behavior after each repository-setting change;
8. document rollback and readback.

Each repository-setting change is a sensitive governance operation and requires explicit approval before execution.

## Current classification

**Confirmed**
- CI baseline is functioning.
- Hostinger Node contract monitor is stable on current `main`.
- native branch protection is absent.
- repository security features listed above are disabled in GitHub metadata.

**Pending**
- capability/plan verification for each security feature;
- exact mutation payloads / settings route;
- harmless validation PR after any approved change;
- final security-hardening readback.

**Blocked**
- no setting change may be executed without explicit approval.

## Next technical step

Prepare a read-only capability matrix for the GitHub security features and determine which controls can be enabled on the current public repository without changing product runtime or deployment.
