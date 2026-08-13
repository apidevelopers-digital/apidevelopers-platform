# Global Trust — Biometric Payment Authorization v2

**Status:** candidate implementation / contract + verification runtime  
**Contract version:** `1.0.0`  
**Financial execution:** disabled by default (`dry-run`)  
**Scope:** transaction-bound authorization using passkeys with local user verification

## 1. Boundary

Global Trust does not capture, receive, infer, or persist a face image, iris scan, palm image/template, fingerprint template, or authenticator private key.

Face, iris, palm, fingerprint, device PIN, or another local factor may unlock a platform authenticator. The server authorizes from a cryptographic passkey/WebAuthn assertion and transaction evidence, not from biometric material.

`localVerificationMethodHint` is non-authoritative UX metadata only. Policy must never treat `face`, `iris`, `palm`, or another hint as proof that a specific biometric modality was used.

## 2. Contracts

### `BiometricPaymentIntent`

Binds:
- opaque payment intent, subject, tenant, and payee identifiers;
- positive integer `amountMinor`;
- ISO 4217 currency;
- explicit `purposeCode`;
- creation and expiry;
- explicit consent requirement;
- no sensitive payment-instrument data.

### `BiometricPaymentChallenge`

Binds the one-time authentication ceremony to:
- intent, subject, tenant, credential;
- random unpadded base64url challenge plus SHA-256 digest;
- SHA-256 payment-context digest;
- payee, amount, currency, and purpose;
- RP ID and exact expected HTTPS origin;
- optional SPC top origin and payee identity;
- optional exact displayed SPC amount;
- `userVerification=required`;
- `oneTimeUse=true`;
- short validity window;
- no biometric material, template, or secret material.

For `secure_payment_confirmation`, top origin, exact displayed amount, and a payee name or origin are mandatory.

### `BiometricPaymentProof`

Contains only verified evidence references:
- proof, challenge, intent, authentication, subject, tenant, and credential IDs;
- assertion digest;
- payment-context digest;
- `userVerified=true`;
- `verificationClass=local_user_verification`;
- non-authoritative local method hint;
- anti-replay result;
- verification time;
- no biometric material, template, or secret material.

## 3. Verification runtime

`apps/api-gateway/src/global-trust-biometric-payment-verifier.mjs` verifies the actual assertion boundary.

It validates:
1. active passkey credential scoped to the same subject and tenant;
2. AAL2 or AAL3;
3. ES256 or RS256 public-key verification;
4. exact one-time challenge and challenge digest;
5. exact client-data type (`webauthn.get` or `payment.get`);
6. exact expected origin;
7. RP ID hash from authenticator data;
8. user-presence and user-verification flags;
9. cryptographic signature over authenticator data and client-data hash;
10. authenticator sign counter when available;
11. for SPC, payment RP, top origin, payee, currency, and displayed amount;
12. assertion digest for downstream evidence.

## 4. Replay and decision policy

The runtime consumes a challenge only once after cryptographic verification. An in-memory implementation exists for deterministic tests and dry-run development.

External financial execution is fail-closed unless both conditions are satisfied:
- `externalExecutionApproved=true`; and
- the challenge store declares `durability="durable"`.

Risk decisions are separated from cryptographic verification:
- critical risk → `deny`;
- high risk → `pending_approval`;
- amount/currency policy may require human approval;
- configured high-value transactions may require SPC.

## 5. Evidence and audit

After a valid assertion, the runtime creates:
- `AuthenticationContext`;
- `BiometricPaymentProof`;
- `RiskAssessment`;
- `AuthorizationDecision`;
- `AuditEvent`;
- `EvidenceRecord`;
- credential sign-count update request.

Audit/evidence contain identifiers and digests, not raw assertion secrets or biometric data.

## 6. Financial adapter boundary

The default adapter is a null `dry-run` adapter:
- provider contact disabled;
- deterministic simulated reference;
- `financialExecutionOccurred=false`.

A real bank, wallet, acquirer, PSP, or payment rail adapter is outside this milestone and must be introduced explicitly with its own contract, idempotency, durable anti-replay state, observability, rollback/compensation behavior, sandbox evidence, and explicit operational approval.

## 7. Verification coverage

Dedicated CI runs on the institutional self-hosted macOS X64 runner and covers:
- contract invariants;
- real ES256 assertion signing and verification;
- Face/iris/palm as non-authoritative local hints;
- challenge replay rejection;
- tampered displayed amount rejection;
- RP/origin/transaction binding;
- risk policy;
- SPC threshold policy;
- fail-closed external adapter behavior;
- no financial execution in dry-run.

## 8. What this milestone does not claim

This implementation does **not** claim:
- remote biometric recognition;
- storage of biometric templates;
- Apple Face ID API access from the server;
- iris or palm vendor certification;
- PCI, EMV, FIDO, banking, LGPD, or other regulatory certification;
- production PSP/acquirer integration;
- production deployment;
- real-money execution.

## 9. Remaining production gates

Before real-money production readiness:
1. choose and contract the financial provider/rail;
2. implement a provider adapter and idempotent execution contract;
3. replace ephemeral replay state with a durable transactional store;
4. validate real device/browser/authenticator compatibility;
5. validate provider sandbox and end-to-end settlement/authorization behavior;
6. complete privacy, threat-model, security, and regulatory reviews;
7. add production observability, incident controls, and rollback/compensation evidence;
8. obtain explicit approval for deploy and real financial execution.

Until those gates are evidenced, the canonical runtime remains safe `dry-run`.
