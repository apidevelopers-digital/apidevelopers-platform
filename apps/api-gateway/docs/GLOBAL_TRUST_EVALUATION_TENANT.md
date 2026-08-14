# Global Trust — Evaluation Tenant

**Status:** provider-neutral sandbox provisioning contract  
**Environment:** sandbox only  
**Financial egress:** blocked  
**Real money:** disabled

## Purpose

The Evaluation Tenant is the controlled bridge between the public Trust demonstration and a customer-specific technical evaluation.

It does not create a second tenancy or credential system. It composes existing platform primitives:

- `@apidevelopers/saas-runtime` for tenant, workspace, trial subscription and entitlements;
- `@apidevelopers/apikey-core` for tenant-scoped API-key lifecycle;
- `@apidevelopers/persistence-core` for durable state.

## Provisioned objects

A first evaluation provisions:

- canonical tenant ID;
- Trust evaluation workspace;
- `trust` / `evaluation` trial subscription with monthly amount `0`;
- active capabilities:
  - `trust-evaluate`;
  - `trust-audit-read`;
  - `trust-evidence-read`;
- one tenant-scoped API key with scopes:
  - `trust:evaluate`;
  - `trust:audit:read`;
  - `trust:evidence:read`;
- an Evaluation record with explicit expiry and sandbox controls.

## Credential boundary

The API-key secret is returned only on first successful provisioning.

The Evaluation record stores the API-key identifier and prefix only. The canonical API-key repository stores a hash, not the raw secret.

A repeated provisioning request for the same tenant is idempotent and returns `secret: null`.

If an active Evaluation API key exists without its Evaluation record, provisioning fails closed with a recovery-required error rather than issuing another secret.

## Sandbox controls

Every Evaluation record is created with:

- `environment = sandbox`;
- `financialEgress = blocked`;
- `realMoney = false`;
- `biometricMaterialAccepted = false`.

These controls are product boundaries. They are not evidence that a financial provider, production datastore, security review, regulatory review, deploy, external egress, or real-money execution is approved.

## Lifetime and limits

Default lifetime: 14 days.

Allowed lifetime: 1–30 days.

Default rate limit metadata: 60 requests per minute.

Maximum allowed evaluation rate metadata: 600 requests per minute.

Default demonstrative amount ceiling: 100,000 minor currency units.

The amount ceiling is sandbox policy metadata only. It is not a financial authorization limit and does not enable money movement.

## Expiry

`assertEvaluationActive()` fails closed when the Evaluation is expired.

`expireEvaluation()` revokes the evaluation API key and changes the Evaluation record to `expired`.

Any HTTP route or Trust sandbox operation using an Evaluation Tenant must execute the active-evaluation guard before performing the requested operation.

## Production boundary

Evaluation is not production.

Production financial execution continues to require the independent Global Trust biometric-payment production activation gates, a named provider/rail, provider certification, durable production state, observability, incident response, deployment approval, external-egress approval and explicit real-money approval.
