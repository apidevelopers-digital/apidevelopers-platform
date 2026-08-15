# Global Trust — Evaluation Credential Handoff

**Status:** provider-neutral code candidate  
**Environment:** Evaluation sandbox only  
**External delivery:** not activated  
**Real money:** disabled

## Purpose

Define a transport-neutral boundary for handing the first-issued Trust Evaluation API credential to an approved customer without placing the raw credential in email, WhatsApp, stdout, logs, audit metadata or a generic HTTP response.

This boundary does not authorize customer onboarding, public-key enrollment, deploy or any real external delivery.

## Envelope

The handoff accepts an explicitly supplied customer RSA public key and seals only the first-issued API credential with:

- RSA-OAEP;
- SHA-256;
- RSA modulus of at least 2048 bits;
- SHA-256 fingerprint of the recipient SPKI public key;
- an OAEP label derived from a canonical context digest.

Envelope version:

`trust-evaluation-credential-envelope/v1`

Algorithm identifier:

`RSA-OAEP-SHA256`

The envelope carries non-secret context:

- tenant ID;
- API-key identifier;
- Evaluation expiry;
- correlation ID;
- recipient public-key fingerprint;
- context digest;
- ciphertext.

The raw API credential is not part of serialized envelope metadata.

## Fail-closed rules

The boundary rejects:

- private-key material supplied as the recipient public key;
- non-RSA public keys;
- RSA keys below 2048 bits;
- unsupported versions or algorithms;
- malformed/non-canonical base64url fields;
- changed context after sealing;
- a private key that does not match the recorded recipient fingerprint.

A delivery-sink failure propagates to the operator provisioning layer. Existing provisioning rules then require recovery and do not silently issue a second credential.

## Ownership boundary

A cryptographically valid public key does **not** prove that the key belongs to the intended customer.

Public-key enrollment and ownership verification remain an institutional onboarding decision. No public key-enrollment endpoint is authorized by this contract.

The public Trust CTA may start a commercial/onboarding conversation, but it is not a credential-delivery channel.

## Channel boundary

This contract intentionally does not choose email, WhatsApp, SMS, chat, stdout, logs or generic HTTP response as the credential transport.

A future approved channel may transport the sealed envelope because possession of the envelope alone does not reveal the credential without the matching customer private key.

No such external transport is activated by this change.

## Institutional separation

`ADR-0004-CREDENCIAL_E_AMBIENTE_INICIAL_OPERATOR_GATEWAY_2026-08-02.md` concerns internal Operator Gateway credential custody and remains a proposal without real activation. It is not reinterpreted here as authorization for customer credential delivery.

## Verification

The dedicated CI uses generated synthetic RSA key pairs and a synthetic credential only. It verifies:

- correct seal/open round-trip;
- plaintext absence from serialized envelope;
- context-tamper rejection;
- wrong-recipient rejection;
- private-key and weak-key rejection;
- canonical encoding checks;
- delivery-sink failure propagation.

Passing CI proves code behavior only. It is not evidence of customer delivery, deployment, production activation or real-money authorization.
