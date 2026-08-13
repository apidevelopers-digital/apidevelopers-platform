# Global Trust Payment — Provider Sandbox Certification

**Status:** verified on feature branch  
**Scope:** provider-neutral sandbox certification only  
**Real-money execution:** disabled  
**External egress:** blocked  
**Institutional authority:** this document is technical evidence for the platform branch; it does not select a provider and does not supersede institutional authority documents.

## 1. Purpose

This milestone defines and verifies the minimum operational contract that a future payment provider adapter must satisfy before any named PSP, acquirer, bank, wallet, or payment rail can be considered for integration.

The certification harness is intentionally provider-neutral. It exercises a local sandbox implementation only and never enables real financial execution.

## 2. Verified controls

The provider control plane is deny-by-default and verifies:

- sandbox-only mode unless a later institutional decision explicitly authorizes another mode;
- explicit provider enablement;
- idempotency by `idempotencyKey`;
- health and readiness signals;
- timeout policy;
- retry only when the provider explicitly declares transport retry as safe;
- per-currency amount limits;
- per-tenant transaction-window limits;
- provider kill switch;
- rejection of external mode under sandbox-only policy;
- rejection of providers marked as capable of real-money execution by the certification harness.

## 3. Certification checks

`certifyBiometricPaymentSandboxProvider(...)` produces a `BiometricPaymentProviderCertificationReport` and requires all checks to pass:

1. `health`
2. `readiness`
3. `idempotency`
4. `kill_switch`
5. `deny_by_default`
6. `external_mode_blocked`
7. `amount_limit`

The report scope declares:

- `sandboxOnly=true`
- `realMoneyExecution=false`
- `rawBiometricDataIncluded=false`
- `secretsIncluded=false`

A failed check produces `TRUST_PAYMENT_PROVIDER_CERTIFICATION_FAILED`.

## 4. CI evidence

Dedicated workflow:

`.github/workflows/global-trust-payment-provider-certification-ci.yml`

The workflow runs on the institutional self-hosted macOS X64 runner and sets:

- `GLOBAL_TRUST_PAYMENT_MODE=sandbox`
- `GLOBAL_TRUST_PAYMENT_EGRESS=blocked`
- `GLOBAL_TRUST_REAL_MONEY=disabled`

At feature-branch head `d628396a8c16f8a273989a82ef8b97338b1a56af`, the following gates completed successfully:

- Global Trust Payment Provider Sandbox Certification CI
- Global Trust Biometric Payment CI
- API Gateway CI
- Platform Baseline CI

## 5. What this does not prove

This milestone does **not** prove or claim:

- selection or approval of any named PSP, bank, acquirer, wallet, or payment rail;
- connectivity to an external provider sandbox;
- provider contractual approval;
- PCI, banking, EMV, FIDO, LGPD, or other regulatory certification;
- production deployment;
- real-money authorization, capture, settlement, refund, or payout;
- approval to enable external egress.

## 6. Next production gate

A named financial provider can only be introduced after an institutional decision identifies the provider and its role.

After that decision, the provider-specific adapter must pass this same sandbox control boundary plus provider-specific contract mapping, reconciliation, negative testing, observability, privacy/security review, and explicit operational approval before any production or real-money enablement.
