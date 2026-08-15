# Global Trust — Evaluation Approved Onboarding

**Status:** code-ready candidate on PR #172  
**Environment:** Evaluation sandbox only  
**Surface:** programmatic / operator-only  
**Public administrative endpoint:** not available  
**External envelope transport:** not activated  
**Real money:** disabled

## Purpose

This boundary composes the already-separated Evaluation controls into one approved onboarding path:

1. recipient RSA public key;
2. one-time proof of possession (PoP);
3. external institutional approval record;
4. approved recipient-key enrollment;
5. operator-only Evaluation Tenant provisioning;
6. sealed credential envelope generated only for the enrolled public key;
7. authenticated Evaluation GET using the recovered sandbox credential.

The orchestration does not perform KYC or legal-identity verification. It consumes the recorded institutional decision and preserves that separation explicitly.

## Composition

`operational-trust-evaluation-composition.mjs` always exposes internal:

- `evaluationRecipientKeyProof`;
- `evaluationRecipientKeyEnrollment`.

`evaluationApprovedOnboarding` exists only when an explicit `deliverEvaluationEnvelope` function is injected.

Without that delivery sink:

- proof and enrollment remain available to internal operator code;
- approved provisioning is absent;
- legacy operator provisioning remains absent unless its separate `credentialHandoff` is explicitly injected;
- no administrative HTTP route is created.

## Approved onboarding rules

`provisionApprovedEvaluation()` accepts operator identity, organization ID and Evaluation provisioning metadata.

It does **not** accept a recipient public key.

Instead, it:

1. reads the approved enrollment for the requested organization;
2. requires enrollment status `approved`;
3. requires `keyPossessionVerified = true`;
4. requires `identityVerifiedByThisService = false`;
5. takes the persisted enrolled SPKI public key;
6. creates the sealed credential-envelope handoff for that exact key;
7. verifies the derived envelope fingerprint matches the enrollment fingerprint;
8. calls the existing operator-only Evaluation provisioning service.

No caller can substitute a different public key at provisioning time.

## First-issue and retry behavior

The first successful Evaluation creation:

- issues the sandbox API credential once;
- seals it to the enrolled RSA public key;
- sends only the sealed envelope to the injected delivery sink;
- returns a safe provisioning receipt without plaintext credential or hash.

An exact retry for an existing Evaluation:

- returns `created = false`;
- returns `secretDelivered = false`;
- does not generate a second envelope;
- does not silently issue a second credential.

## Sandbox safety boundary

The Evaluation remains:

- `environment = sandbox`;
- `financialEgress = blocked`;
- `realMoney = false`;
- `biometricMaterialAccepted = false`.

The approved onboarding path does not:

- choose or activate an external transport channel;
- deliver plaintext credentials by email, WhatsApp, SMS, chat, logs or generic HTTP responses;
- create public self-provisioning or public key-enrollment endpoints;
- enable production;
- enable real-money execution.

## Verification

The dedicated `Global Trust Evaluation Approved Onboarding CI` uses synthetic RSA key material and verifies:

- PoP challenge/sign/consume;
- approved enrollment;
- provisioning using only the enrolled public key;
- sealed envelope creation;
- envelope opening with the matching private key;
- authenticated `GET /v1/trust/evaluation`;
- retry idempotency and no second envelope;
- fail-closed behavior when approved enrollment is absent;
- absence of approved provisioning when no envelope sink is injected;
- absence of plaintext API credential and private-key material from persisted state.

At code checkpoint:

`6fb0efe039b9e472daf46e7ba986520e04f61715`

the following gates agreed on the same head:

- Global Trust Evaluation Approved Onboarding CI — SUCCESS;
- Global Trust Evaluation Recipient Key Enrollment CI — SUCCESS;
- Global Trust Evaluation Recipient Key Proof CI — SUCCESS;
- Global Trust Evaluation Tenant CI — SUCCESS;
- Global Trust Evaluation Credential Envelope CI — SUCCESS;
- Global Trust Evaluation Sealed Handoff Integration CI — SUCCESS;
- Global Trust Evaluation Operational CI — SUCCESS;
- API Gateway CI — SUCCESS;
- Platform Baseline CI — SUCCESS.

This is code-behavior evidence only. It is not evidence of merge, deploy, real-customer enrollment, external credential delivery, production activation or real-money approval.

## Remaining institutional boundary

The next unresolved boundary is an approved external transport for the sealed envelope.

The transport must carry **ciphertext only** and must not reinterpret a transport channel as proof of customer identity or authorization. Channel selection and activation require an institutional decision and explicit operational approval.
