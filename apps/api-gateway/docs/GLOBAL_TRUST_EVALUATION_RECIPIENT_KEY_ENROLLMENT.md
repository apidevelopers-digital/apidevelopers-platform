# Global Trust — Evaluation Recipient Key Enrollment

**Status:** provider-neutral code candidate  
**Environment:** Evaluation sandbox only  
**Surface:** programmatic / operator-only  
**Public enrollment endpoint:** not available  
**External identity verification:** required as an institutional decision, not performed by this service  
**Real money:** disabled

## Purpose

The Recipient Key Enrollment record binds an organization to a recipient RSA public key only after two independent conditions are present:

1. a successfully consumed cryptographic proof of possession for that public key; and
2. an explicit external institutional approval that the organization and intended recipient are authorized for the Evaluation.

This service records the institutional decision. It does not perform KYC, corporate-identity verification, representative-authority verification, contract acceptance or compliance review.

## Required operator identity

Enrollment creation and enrollment reads are operator-only.

The caller must be an active platform administrator with:

- `role = admin`;
- a non-empty principal ID;
- scope `admin:*`.

Non-admin identities fail before an enrollment is created or read.

## Required proof of possession

The service does not trust a caller-supplied proof object.

It reads the canonical persisted Recipient Key Proof challenge and requires:

- challenge status `consumed`;
- version `trust-evaluation-recipient-key-proof/v1`;
- algorithm `RSA-PSS-SHA256`;
- the same organization ID;
- the same SHA-256 SPKI recipient-key fingerprint;
- `keyPossessionVerified = true`;
- `identityVerified = false`;
- a persisted verification timestamp.

The recipient key must be RSA with a modulus of at least 2048 bits. Private-key material is rejected.

## Required institutional approval

The service requires a structured external approval containing:

- `decision = approved`;
- `assertion = organization_and_recipient_authorized`;
- approval reference;
- institutional authority;
- approver identifier;
- approval timestamp;
- subject organization ID0.

The subject organization must match the requested organization.

An approval timestamp later than the enrollment recording time fails closed.

The presence of this approval means only that an external institutional decision was recorded. This service does not claim that it independently verified the legal identity or authority of the organization or representative.

## Persisted enrollment

Enrollment version:

`trust-evaluation-recipient-key-enrollment/v1`

The approved record persists:

- deterministic enrollment ID;
- organization ID;
- recipient RSA public key in SPKI PEM;
- SHA-256 SPKI key fingerprint;
- consumed proof reference and non-secret verification metadata;
- institutional approval reference and metadata;
- operator who recorded the enrollment;
- recording timestamp;
- `identityVerification.performedByThisService = false`;
- `identityVerification.source = external_institutional_decision`.

It does not persist:

- recipient private key;
- proof signature;
- Evaluation API-key secret;
- API-key hash;
- raw biometric material.

## Idempotency and key changes

The enrollment ID is deterministic per organization.

An exact retry for the same organization, key, proof and institutional approval is idempotent and does not rewrite the enrollment.

If the organization already has an approved enrollment for a different recipient key, the service fails closed with a conflict. Key replacement requires a separate rotation or revocation workflow; this service does not silently overwrite an approved key.

## Relationship to credential handoff

An approved enrollment can provide the recipient public key that a future operator-only onboarding composition uses to create a sealed Evaluation credential envelope.

The approved enrollment does not itself:

- provision an Evaluation Tenant;
- issue an API-key secret;
- deliver an envelope to an external channel;
- expose an HTTP enrollment route;
- enable production or real-money execution.

Credential provisioning and sealed handoff remain separate controls.

## Public-surface boundary

The public Trust CTA may initiate a commercial/onboarding conversation.

It does not:

- create an approved recipient-key enrollment;
- self-attest institutional identity;
- turn a successful proof of possession into institutional approval;
- accept a recipient private key;
- return a plaintext API credential;
- activate external delivery.

No public recipient-key enrollment endpoint is authorized by this contract.

## Verification

The dedicated `Global Trust Evaluation Recipient Key Enrollment CI` runs on the institutional self-hosted macOS runner and verifies, with synthetic keys and state only:

- consumed PoP plus external approval are both required;
- public-key material is the only key material persisted;
- private key and signature are absent from persisted state;
- exact retry is idempotent;
- a different key for the same organization is rejected until rotation/revocation exists;
- unconsumed PoP is rejected;
- non-admin creation/read is rejected;
- approval subject and assertion are checked;
- future-dated approval is rejected.

Passing CI proves code behavior only. It is not evidence of real customer enrollment, identity verification, external credential delivery, deployment, production activation or real-money authorization.
