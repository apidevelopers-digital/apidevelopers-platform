# Global Trust — Evaluation Recipient Key Proof

**Status:** provider-neutral code candidate  
**Environment:** Evaluation sandbox only  
**External enrollment:** not activated  
**Identity verification:** not implemented by this contract  
**Real money:** disabled

## Purpose

The Recipient Key Proof boundary proves that the party answering an Evaluation onboarding challenge possesses the private key corresponding to a submitted RSA public key.

It does **not** prove the legal identity of a company, the authority of an employee or representative, contractual acceptance, compliance status, or eligibility for production.

The successful result therefore distinguishes:

- `keyPossessionVerified = true`
- `identityVerified = false`

No caller may reinterpret key possession as institutional identity approval.

## Protocol

Version:

`trust-evaluation-recipient-key-proof/v1`

Algorithm:

`RSA-PSS-SHA256`

Recipient keys must:

- be RSA public keys;
- use a modulus of at least 2048 bits;
- contain no private-key material.

A challenge contains at least 32 cryptographically random bytes and is bound to:

- organization ID;
- SHA-256 fingerprint of the recipient SPKI public key;
- issued time;
- expiry time;
- correlation ID.

The signing payload additionally binds the generated challenge ID.

Verification uses RSA-PSS with SHA-256 and a 32-byte salt.

## Lifetime

Default challenge lifetime: 5 minutes.

Allowed challenge lifetime: 1–15 minutes.

TTL must be a safe integer.

Expired challenges fail closed.

## Persistence and replay

Challenges are persisted through the canonical persistence store and consumed transactionally.

A successful verification changes the challenge from `active` to `consumed`.

Replay is rejected.

Concurrent verification attempts for the same challenge result in at most one successful consumption.

Invalid signatures and recipient-key mismatches do not consume a still-valid challenge, allowing the legitimate recipient to retry before expiry.

## Persisted data boundary

The persisted challenge may contain non-secret onboarding context required to bind and verify the proof.

It must not persist:

- the recipient private key;
- the submitted signature;
- an Evaluation API credential;
- an API-key secret or hash;
- raw biometric material.

The verification record stores the result state and verification time, including the explicit distinction between key possession and identity verification.

## Relationship to the sealed credential envelope

The sealed Evaluation credential envelope may encrypt a first-issued sandbox API credential for an approved RSA public key.

Before an institution treats a public key as belonging to an intended customer, technical onboarding should require a successful Recipient Key Proof for that key.

A successful proof only establishes possession of the matching private key. It does not decide whether the person or organization is authorized to receive an Evaluation Tenant.

## Institutional approval boundary

There is currently no canonical customer-identity package or public customer-key enrollment endpoint in `apidevelopers-platform`.

For that reason this contract does not fabricate a KYC, company-identity, representative-authority or contractual-approval mechanism.

A future production-quality enrollment process must combine:

1. successful cryptographic proof of private-key possession; and
2. a separate institutional decision that the organization and responsible party are authorized for the Evaluation.

Only after both conditions are satisfied may an approved enrollment record bind a customer organization to the recipient-key fingerprint.

The method used to establish the institutional identity/authority decision must be defined separately by institutional governance.

## Public surface boundary

The public Trust CTA may initiate a commercial/onboarding conversation.

It does not:

- enroll a public key automatically;
- verify legal identity;
- issue an Evaluation credential;
- deliver plaintext credentials;
- activate production or real money.

No public recipient-key enrollment endpoint is authorized by this contract.

## Verification

The dedicated `Global Trust Evaluation Recipient Key Proof CI` uses generated synthetic RSA key pairs and synthetic challenges only.

It verifies:

- successful RSA-PSS proof;
- persistence across store reopen;
- one-time replay protection;
- concurrent consume behavior;
- wrong-recipient rejection;
- invalid-signature rejection without consuming a valid challenge;
- expiry rejection;
- private-key and weak-key rejection;
- integer TTL enforcement;
- absence of private-key and signature material from persisted state.

Passing CI proves code behavior only. It is not evidence of real customer enrollment, legal identity verification, external credential delivery, deployment, production activation or real-money authorization.
