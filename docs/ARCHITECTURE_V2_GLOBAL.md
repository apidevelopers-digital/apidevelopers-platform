# Global Architecture v2

Status: Draft for review
Date: 2026-07-15
Owner: API Developers.digital

## Purpose

Define the target architecture for a global, multi-tenant technology platform consumed by `uni.`, `uni.co`, `imuni.`, `uni.juri`, `uni.verso` and external customers.

## Platform domains

### Core
- identity
- tenancy
- organizations
- permissions
- audit
- events
- configuration
- secrets references

### Intelligence
- conversation engine
- workflow engine
- memory
- guard
- knowledge
- transcription
- translation

### Channels
- WhatsApp API
- Instagram API
- email API
- webchat API
- voice API
- push API

### Business services
- CRM
- media
- finance
- health
- legal
- commerce
- documents
- notifications

### Developer platform
- gateway
- developer portal
- API console
- OpenAPI registry
- SDKs
- sandbox
- usage
- billing
- observability

## Product consumers

- `uni.`: commercial platform, media, software, AI, WhatsApp, CRM and marketplace
- `uni.co`: universal assistant and orchestrator
- `imuni.`: health product
- `uni.juri`: legal product
- `uni.verso`: product environment
- external customers: isolated tenants using neutral APIs

## Repository target

```text
apps/
engines/
services/
packages/
openapi/
tests/
docs/
scripts/
.github/
```

## Architectural rules

1. Platform services use neutral technical names.
2. Product branding stays in customer-facing products.
3. Every request carries tenant, request and correlation identifiers.
4. Sensitive actions require explicit approval and audit evidence.
5. No service uses global credentials for multiple customers.
6. Public APIs are versioned and contract-first.
7. Production migrations require backup, compatibility, smoke test and rollback.
8. Health and legal workloads have a minimum R4 risk classification.
9. `uni.co` orchestrates services; it does not own every implementation.
10. `uni.` consumes platform APIs and remains operational during migration.

## Migration order

1. contracts
2. identity and tenancy
3. events and audit
4. memory and guard
5. conversation engine
6. workflow engine
7. `uni.co`
8. WhatsApp API
9. Instagram API
10. radar and observability
11. `uni.` consumers
12. health and legal verticals
13. legacy cleanup

## Success criteria

The platform is ready for product migration when:
- contracts are versioned;
- tenant isolation is tested;
- identity and permissions are operational;
- events and audit are durable;
- memory is persistent and revocable;
- engines pass automated tests;
- channels support multiple accounts;
- rollback procedures are documented.
