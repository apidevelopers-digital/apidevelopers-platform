# Trust Biometric Login Decision v1

Status: sandbox-conformance; non-production.

## Goal

Compose the existing biometric adapter, biometric decision policy, subject-to-principal resolution and SaaS access runtime into one fail-closed login decision.

Flow:

`biometric result -> policy decision -> subjectRef -> SaaS principal -> active grant -> access evaluation`

This v1 deliberately stops before session-secret or browser-cookie issuance.

## Required integrations

The flow requires injected implementations for:

- `biometricAdapter.verifyFaceLiveness(request)`;
- `evaluateBiometricPolicy({ biometricResult, context })`;
- `resolvePrincipalBySubjectRef({ tenantId, subjectRef })`;
- `accessRuntime.resolveActiveGrant(...)`;
- `accessRuntime.evaluateAccess(...)`.

The biometric request must remain `environment="sandbox"`.

## Security boundaries

The flow rejects raw or inline biometric/media/template/embedding/ciphertext/key/KMS/secret/token/password/cookie/session-secret material and binary payloads.

A biometric result is only admissible when it remains `adapterMode="sandbox-conformance"`, `productionAuthorized=false`, and reports that raw biometric material was neither forwarded nor persisted.

The policy decision must include an auditable `policyId` and `sha256:<64 hex>` digest and must explicitly keep `productionValidated=false`.

Liveness failure, biometric-policy denial, unresolved/inactive principal, missing grant, or SaaS access denial all fail closed before the next stage.

## Authorized result

An authorized result binds:

- biometric verification metadata;
- face modality;
- sandbox authentication method;
- principal and tenant;
- active access grant;
- workspace and product access decision.

It still returns:

- `session.issuanceAllowed=false`;
- `session.issued=false`;
- `productionAuthorized=false`;
- `productionReady=false`.

## Not claimed

This module does not prove production face recognition, production liveness/PAD, validated thresholds, provider authenticity, independent biometric validation, production session issuance, template-vault/KMS readiness, or production biometric login.

The next stage is an `auth-core` session issuer that consumes only an already-authorized metadata-only decision and still must keep biometric raw material outside the session layer.
