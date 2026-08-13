# Global Trust Payment — Provider Sandbox Certification

**Status:** provider-neutral sandbox verified  
**Real-money execution:** disabled  
**External egress:** blocked  
**Authority:** technical platform evidence only; this document does not select or approve a provider.

## Verified provider-neutral controls

The sandbox boundary verifies:
- deny-by-default and sandbox-only mode;
- explicit provider enablement;
- idempotency by `idempotencyKey`;
- amount and tenant-window limits;
- timeout and safe-retry rules;
- health/readiness;
- provider kill switch;
- rejection of external mode and real-money-capable providers;
- sanitized telemetry and incident events;
- shared `closed/open/half-open` circuit breaker;
- authorization and reconciliation through the same circuit;
- read-only reconciliation control path;
- operational composition into persistent execution;
- provider conformance manifest.

The conformance boundary remains:
- `providerSelectedByInstitution=false`;
- `productionApproved=false`;
- `realMoneyApproved=false`;
- `sandboxOnly=true`;
- `realMoneyExecution=false`;
- `rawBiometricDataIncluded=false`;
- `secretsIncluded=false`.

## Current CI evidence

At feature-branch head `53508ea233dbdf61845c7be5e788170140242895`, these relevant gates completed successfully:
- Global Trust Payment Provider Sandbox Certification CI;
- Global Trust Payment Provider Reconciliation CI;
- Global Trust Biometric Payment CI;
- Global Trust Biometric Payment PostgreSQL Durability CI;
- API Gateway CI;
- Platform Baseline CI;
- Persistence Core CI.

The operational E2E proves the provider-neutral path:

`SPC/passkey → Trust decision → operational adapter → provider control → circuit breaker → provider sandbox → persistence/reconciliation`

The PostgreSQL durability gate separately proves transactional anti-replay across concurrent connections and reconnect.

## Not claimed

This evidence does not claim:
- selection or approval of a named PSP, bank, acquirer, wallet, or payment rail;
- connectivity to an external provider sandbox;
- provider contractual approval;
- provider-specific settlement/capture/refund/payout behavior;
- real-device biometric compatibility certification;
- PCI, banking, EMV, FIDO, LGPD, or other regulatory certification;
- production datastore provisioning;
- production deployment;
- real-money execution;
- approval to enable external egress.

## Next production gate

A named provider may only be introduced after an institutional decision identifies the provider and its role.

After that decision, its adapter must pass the same provider-neutral controls plus provider-specific request/response mapping, sandbox authorization/reconciliation, negative/error/idempotency cases, provider observability, applicable settlement/capture/refund/compensation behavior, privacy/security/legal/regulatory review, and explicit operational approval before production or real-money enablement.
