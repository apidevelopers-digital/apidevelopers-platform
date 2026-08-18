# Global Trust — Biometric Payment Authorization

**Status:** provider-neutral operational sandbox verified  
**Contract version:** `1.0.0`  
**Financial execution:** disabled (`dry-run`)  
**External egress:** blocked in verified gates

## Security boundary

Global Trust never requires the server to receive or store face images, iris scans, palm images/templates, fingerprint templates, authenticator private keys, PAN, or CVV.

Face, iris, palm, fingerprint, device PIN, or another local factor may unlock a platform authenticator. The server authorizes from a cryptographic passkey/WebAuthn/SPC assertion bound to the transaction.

`localVerificationMethodHint` is non-authoritative UX metadata only. `face`, `iris`, and `palm` are not server-side proof of a specific biometric modality.

## Verified runtime

The current runtime verifies:
- subject/tenant-scoped active passkeys with AAL2/AAL3;
- ES256/RS256 signatures;
- exact one-time challenge and digest;
- expected HTTPS origin and RP ID;
- user presence and user verification;
- authenticator sign counter when available;
- SPC top origin, payee, currency, and displayed amount;
- transaction-bound payment-context digest;
- risk policy and authorization decision;
- audit/evidence without raw biometric or payment-secret material.

The operational provider-neutral sandbox adds:
- deny-by-default control;
- sandbox-only provider mode;
- idempotency, amount and tenant-window limits;
- timeout and safe-retry policy;
- health/readiness and kill switch;
- sanitized telemetry and incidents;
- shared `closed/open/half-open` circuit breaker for authorization and reconciliation;
- persistent execution/reconciliation wiring;
- provider conformance manifest and sandbox certification.

## Durable anti-replay

`createPostgresBiometricPaymentChallengeStore(...)` provides durable transactional replay state.

`Global Trust Biometric Payment PostgreSQL Durability CI` starts ephemeral PostgreSQL 16 on the institutional self-hosted macOS X64 runner and proves:
- cross-connection challenge visibility;
- concurrent atomic consume with exactly one winner;
- replay rejection for the losing consumer;
- state durability across reconnect;
- replay rejection after reconnect.

This is code/CI evidence. It does not claim that a production PostgreSQL service has been provisioned, migrated, backed up, monitored, or recovery-tested in a deployed payment environment.

## Current evidence

At feature-branch head `53508ea233dbdf61845c7be5e788170140242895`, these relevant gates completed successfully:
- Global Trust Biometric Payment PostgreSQL Durability CI;
- Global Trust Payment Provider Reconciliation CI;
- Global Trust Payment Provider Sandbox Certification CI;
- Global Trust Biometric Payment CI;
- API Gateway CI;
- Platform Baseline CI;
- Persistence Core CI.

The operational E2E covers:

`SPC/passkey → Trust decision → operational adapter → control/circuit → provider sandbox → persistence/reconciliation`

and verifies `face`, `iris`, and `palm` as non-authoritative local hints with no real-money execution.

## Not claimed

This milestone does not claim:
- remote biometric recognition or storage of biometric templates;
- Apple Face ID server API access;
- proof that face, iris, or palm was the exact local modality used;
- real-device/browser/authenticator compatibility certification;
- named PSP/bank/acquirer/wallet selection or approval;
- external provider sandbox connectivity;
- provider-specific capture/settlement/refund/payout behavior;
- PCI, EMV, FIDO, banking, LGPD, or other regulatory certification;
- production PostgreSQL provisioning;
- production deployment or real-money execution.

## Remaining production gates

1. Select and institutionally approve the financial provider/rail and its role.
2. Implement and certify the provider-specific adapter against the selected provider's real sandbox, including reconciliation and negative/error cases.
3. Provision the production durable datastore and evidence migrations, backup/restore, monitoring, access control, and recovery.
4. Validate real target device/browser/authenticator compatibility for the intended local face/iris/palm experiences where supported.
5. Validate provider-specific authorization plus settlement/capture/refund/compensation behavior as applicable.
6. Complete privacy, threat-model, security, legal, and regulatory reviews.
7. Evidence production observability, incident response, rollback/compensation, and runbooks.
8. Obtain explicit approval for deployment, external egress, and real financial execution.

Until those gates are evidenced, the runtime remains safe `dry-run` / sandbox and real money remains disabled.
