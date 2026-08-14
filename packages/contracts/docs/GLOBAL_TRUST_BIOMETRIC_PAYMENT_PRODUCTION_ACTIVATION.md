# Global Trust — Biometric Payment Production Activation

**Status:** fail-closed production activation guard implemented and CI-verified  
**Scope:** provider-neutral activation evidence for external payment execution  
**Default:** production blocked; external egress blocked; real money disabled

## Purpose

This document records the production activation boundary for Global Trust biometric payment authorization.

`externalExecutionApproved=true` is necessary but is not sufficient to construct an external payment path.

An external path must also present a complete `productionActivation` evidence package bound to the exact provider identity.

## Required evidence gates

Every gate must include:

- `approved: true`
- a non-empty `evidenceRef`
- a valid ISO-8601 `approvedAt`

Required gates:

1. `providerSelectedByInstitution`
2. `providerContractApproved`
3. `providerSandboxCertified`
4. `providerReconciliationCertified`
5. `productionDatastoreReady`
6. `deviceCompatibilityValidated`
7. `securityReviewApproved`
8. `privacyReviewApproved`
9. `legalReviewApproved`
10. `regulatoryReviewApproved`
11. `observabilityReady`
12. `incidentResponseReady`
13. `rollbackCompensationReady`
14. `deployApproved`
15. `externalEgressApproved`
16. `realMoneyApproved`

The activation package must target `environment=production` and identify the exact `providerId`.

## Enforcement points

The same activation evidence is enforced at all external construction boundaries:

- raw biometric payment runtime;
- credential-bound biometric payment runtime;
- biometric payment execution adapter.

A direct boolean, a durable store, or a custom external adapter cannot bypass the activation evidence gate.

Sandbox and dry-run paths remain independent and do not require production activation evidence.

## Sensitive-material boundary

Production activation evidence rejects fields that resemble:

- API keys, passwords, bearer/access tokens, private keys, or client secrets;
- PAN/card number, CVV/CVC;
- biometric material or templates, including face image, iris scan, or palm image.

The activation package is evidence metadata, not a secrets container.

## Verified CI evidence

At feature-branch head `3116c240a7e8fdb1488084384653a226dcec68eb`, the following relevant gates completed successfully on the institutional CI:

- Global Trust Biometric Payment Production Activation CI;
- Global Trust Biometric Payment PostgreSQL Durability CI;
- Global Trust Biometric Payment CI;
- Global Trust Payment Provider Sandbox Certification CI;
- Global Trust Payment Provider Reconciliation CI;
- API Gateway CI;
- Platform Baseline CI.

The Production Activation CI separately proves:

- missing production evidence blocks an external raw runtime;
- provider identity mismatch blocks activation;
- credential-bound runtime enforces and propagates activation evidence;
- external execution adapter enforces activation evidence;
- complete synthetic evidence permits constructor validation only.

No test in this gate contacts a real financial provider or performs a financial transaction.

## What is not approved or completed

This guard does not claim that any required production evidence already exists.

The following remain external/institutional prerequisites:

- selection and institutional approval of a named provider/payment rail;
- contractual approval;
- real provider sandbox integration and provider-specific certification;
- production datastore provisioning, migration, backup/restore, monitoring, and recovery evidence;
- target device/browser/authenticator compatibility validation;
- security, privacy, legal, and regulatory reviews;
- production observability, incident response, rollback/compensation, and runbooks;
- explicit deployment approval;
- explicit external-egress approval;
- explicit real-money approval.

Until those prerequisites are evidenced, production activation remains blocked.
