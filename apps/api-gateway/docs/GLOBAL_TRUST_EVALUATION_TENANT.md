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

The API-key secret exists only on first successful issuance.

The Evaluation record stores the API-key identifier and prefix only. The canonical API-key repository stores a hash, not the raw secret.

A repeated provisioning request for the same tenant is idempotent and does not reissue or return the secret.

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

Default rate-limit metadata: 60 requests per minute.

Maximum allowed evaluation rate metadata: 600 requests per minute.

Default demonstrative amount ceiling: 100,000 minor currency units.

The amount ceiling is sandbox policy metadata only. It is not a financial authorization limit and does not enable money movement.

## Expiry

`assertEvaluationActive()` fails closed when the Evaluation is expired.

`expireEvaluation()` revokes the Evaluation API key and changes the Evaluation record to `expired`.

Any Trust sandbox operation using an Evaluation Tenant must execute the active-evaluation guard before performing the requested operation.

## Authenticated client surface

The operational Evaluation surface exposes only:

`GET /v1/trust/evaluation`

The route:

- requires a valid tenant-scoped API key;
- requires scope `trust:evaluate`;
- binds the authenticated tenant to the Evaluation record;
- fails closed for missing, inactive or expired Evaluation state;
- returns sandbox context, limits, capabilities and controls only;
- never returns the raw API-key secret, API-key hash, API-key identifier or API-key prefix.

No public self-provisioning endpoint exists.

## Runtime feature flag

The operational server recognizes:

`GLOBAL_TRUST_EVALUATION_ENABLED`

Rules:

- absent, empty, or `false` => disabled;
- `true` => attaches the authenticated Evaluation read surface;
- any other value => startup fails before runtime/server bind.

The flag is disabled by default. Enabling the flag does not create an Evaluation Tenant and does not provide an administrative provisioning surface.

The Trust attachment preserves the existing read-only operator composition rather than replacing it.

## Operator-only provisioning

Administrative Evaluation provisioning is a programmatic service, not an HTTP route.

It requires an active platform admin identity with:

- `role = admin`;
- non-empty principal ID;
- scope `admin:*`.

The service:

1. provisions the Evaluation through the canonical tenant service;
2. re-validates the sandbox boundary;
3. hands a first-issued credential to an explicitly injected `credentialHandoff`;
4. returns a safe receipt without the raw secret or hash;
5. records the operation through the canonical Trust audit recorder.

Non-admin identities fail before tenant creation or credential handoff.

A handoff failure is audited as failed and returns a recovery-required error. It does not automatically issue a second credential.

## Secure handoff injection boundary

`evaluationOperatorProvisioning` exists only when a `credentialHandoff` implementation is explicitly injected into the Trust operational composition.

Without a handoff implementation:

- the authenticated Evaluation GET surface can still exist when the feature flag is enabled;
- the Evaluation tenant service remains available to internal code;
- the administrative provisioning property is absent.

The normal operational-server bootstrap does not inject a credential handoff, so it does not gain administrative provisioning by enabling the Evaluation feature flag.

The existing operator secret resolver and vault secret provider are read/lease mechanisms for already-existing secret references. They are not credential-delivery channels.

**Blocked:** the institution has not yet selected and recorded a canonical secure channel for delivering a newly issued Evaluation credential to a customer. No ad-hoc email, messaging, stdout, log, or HTTP-response delivery channel is authorized by this contract.

## Audit boundary

The operator provisioning audit records operational outcome and non-sensitive context only.

Audit metadata may include:

- correlation ID;
- whether the Evaluation was created;
- `credentialDelivered` boolean;
- workspace/subscription/product/plan context;
- environment/status/expiry;
- scope/capability counts;
- sandbox limits and controls.

Audit metadata does not include:

- the raw API-key secret;
- secret-bearing field names;
- API-key identifier;
- API-key prefix;
- API-key hash;
- raw biometric material.

## Verified code gate

The Evaluation Tenant, Operational Evaluation, API Gateway and Platform Baseline CI gates are required to agree on the same branch head before this boundary is treated as code-ready.

The verified gate proves code behavior only. It is not deploy evidence and it does not activate any environment.

## Production boundary

Evaluation is not production.

Production financial execution continues to require the independent Global Trust biometric-payment production activation gates, a named provider/rail, provider certification, durable production state, observability, incident response, deployment approval, external-egress approval and explicit real-money approval.

No Evaluation feature flag, secure-handoff implementation, tenant provisioning, or sandbox entitlement can bypass those gates.
