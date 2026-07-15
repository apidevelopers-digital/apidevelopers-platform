# ADR 0001 — Platform Boundary

Status: Accepted
Date: 2026-07-15

## Decision

API Developers.digital is the owner of the reusable technology platform.
`uni.` is the commercial platform at `sitedauni.com` and consumes the technology exposed by API Developers.digital.

## API Developers.digital owns

- APIs and SDKs
- engines
- contracts
- auth, tenancy, guard and audit
- events, memory and radar
- channel integrations
- developer tooling
- observability
- infrastructure

## `uni.` owns

- sitedauni.com
- marketplace
- software products
- media and AI experiences
- WhatsApp operations
- CRM, sales and customer facing panels
- health, legal and business products

## Naming rule

Platform services must use neutral technical names. Product labels may use `uni.` branding in customer-facing experiences.

## Migration rule

No production component is removed until a compatible replacement is validated with backup, rollback and operational evidence.
