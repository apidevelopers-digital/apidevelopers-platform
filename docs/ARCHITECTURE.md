# Architecture

## Purpose

API Developers.digital is the official technology platform.

`uni.` is the commercial platform at `sitedauni.com` and consumes the technology exposed by API Developers.digital.

## Platform layers

- apps: gateway, developer console and operational entrypoints
- engines: conversation, workflow and orchestration
- services: memory, guard, events, radar and channels
- packages: contracts, auth, tenancy, observability and SDKs
- openapi: public and internal API contracts
- tests: unit, integration and compatibility tests
- docs: architecture, migration, governance and ADRs

## Core principles

- multi-tenant by default
- versioned contracts
- least privilege
- auditability
- dry-run before sensitive execution
- explicit approval for destructive, financial, legal, medical and publishing actions
- internationalization from the foundation
- backward-compatible migration
- rollback for every production change

## Ownership boundary

API Developers.digital owns reusable technology.

`uni.` owns customer-facing products, commerce, media, software, AI experiences, WhatsApp operations and integrations sold through `sitedauni.com`.

## Target repository layout

```text
apps/
engines/
services/
packages/
openapi/
tests/
docs/
.github/
```
