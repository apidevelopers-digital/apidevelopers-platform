# Trust Preview / Face — Continuity

**Status:** corrected continuity checkpoint  
**Date:** 2026-08-26  
**Repository:** `apidevelopers-digital/apidevelopers-platform`  
**Main checkpoint:** `33c10c6d073055e6fca97d67fdd5f99425e54c56`  
**Front:** `trust-preview.apidevelopers.digital` → Face

## 1. Scope

This checkpoint covers only the Trust Preview / Face front.

The active scope is the Global Trust / biometric / Face path implemented in the API Gateway and its Trust-specific CI, governance, Evaluation sandbox, adapter and live-provider boundaries.

## 2. Explicitly out of scope

The following are separate work and must not be counted as Trust Preview / Face progress:

- UniJuri delegated binding;
- UniJuri Keychain provisioning;
- UniJuri Keychain helper installation;
- UniJuri runner selection or Keychain capability labels;
- PR #316 and any UniJuri provisioning runs;
- draft PR #319 and its `unijuri-keychain` runner work.

Presence in the same `api-gateway` repository does not establish a dependency between Trust Face and UniJuri.

## 3. Correction of the previous checkpoint

The previous content of this document incorrectly mixed Trust Preview / Face continuity with UniJuri Keychain runner work.

That association is superseded by this checkpoint.

PR #318 preserved a continuity document but the content was contaminated by the same cross-front assumption. The merge itself is historical evidence only; its UniJuri details are not a blocker or progress signal for Trust Preview / Face.

Do not inherit the previously stated 94% or 95% Trust Face percentages from UniJuri work. Recompute progress from Trust-only evidence.

## 4. Confirmed Trust-only implementation

Current `main` contains Trust-specific implementation and active workflows including:

- `Global Trust Biometric Payment CI`;
- `Global Trust Biometric Payment PostgreSQL Durability CO`;
- `Global Trust Biometric Payment Production Activation CI`;
- `Global Trust Evaluation Approved Onboarding CI`;
- `Global Trust Evaluation Credential Envelope CI`;
- `Global Trust Evaluation Envelope Transport CI`;
- `Global Trust Evaluation Operational CI`;
- `Global Trust Evaluation Portal CI`;
- `Global Trust Evaluation Recipient Key Enrollment CI`;
- `Global Trust Evaluation Recipient Key Proof CI`;
- `Global Trust Evaluation Sealed Handoff Integration CI`;
- `Global Trust Evaluation Tenant CI`;
- `Global Trust Staging Harness CI`;
- `Global Trust Staging Harness Hardening CI`;
- `Global Trust Staging Operational Bindings CI`;
- `Trust Governance Runtime CI`;
- `Trust M3 Operational CI`;
- `Trust M3 Packaging CI`;
- `Trust M4 Adapter Contract Preflight CI`;
- `Trust M4 AWS Adapter Dry Run CI`.

The gateway package also declares Trust-specific runtime dependencies:

- `@apidevelopers/trust-biometric-adapter-aws`;
- `@apidevelopers/trust-biometric-adapter-contract`;
- `@apidevelopers/trust-governance-runtime`.

## 5. Face-specific boundary

`apps/api-gateway/src/global-trust-face-lab-live-provider.mjs` is a Trust Face live-provider boundary.

It is fail-closed: the provider is created only when the required Trust AWS live-call flags, explicit sandbox approval, region and S3 configuration are present. Otherwise it returns no live provider.

This file is Trust-specific and is the correct implementation family for the Face continuation.

## 6. Evaluation safety boundary

The current Evaluation onboarding documentation explicitly keeps Evaluation in sandbox:

- `environment = sandbox`;
- `financialEgress = blocked`;
- `realMoney = false`;
- `biometricMaterialAccepted = false`.

It also states that code/test success is not evidence of deploy, real-customer onboarding, external credential delivery, production activation or real-money approval.

Therefore Evaluation readiness must not be confused with live Face preview readiness.

## 7. Verified historical CI evidence

The `Global Trust Biometric Payment CI` workflow has a recorded successful run for PR #171 at head `358a6f22b96676647f9427b57b8754c4546f26b0`.

This confirms code/test evidence for the biometric payment contract family. It does not by itself prove that the current public Face preview is deployed or operational end to end.

## 8. Current reanchored direction

From this checkpoint onward, continue only through the Trust Face path:

1. identify the public Face entrypoint behind `trust-preview.apidevelopers.digital`;
2. map it to the current Trust Face / biometric gateway implementation;
3. verify the current deployment/runtime surface;
4. verify the Face flow end to end with Trust-specific evidence;
5. recompute the front percentage only from those findings;
6. close remaining Trust-only gaps toward 100%.

## 9. Continuity rule

When resuming this front:

- read this checkpoint;
- re-read current `main`;
- inspect Trust-specific PRs, workflows, runs and commits;
- ignore UniJuri unless an explicit, current GitHub authority proves a direct dependency;
- never use UniJuri runner or Keychain work as Trust Face progress.

## 10. Next action

Audit the live/public Face route and its binding to the current Trust Face implementation before making any further code or infrastructure change.
