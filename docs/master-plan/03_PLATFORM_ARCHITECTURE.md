# API Developers.digital — Platform Architecture

Status: Active  
Date: 2026-07-15  
Owner: API Developers.digital

## Purpose

Define the global architecture, domain boundaries, allowed dependencies and isolation rules for the API Developers.digital platform.

## Architectural layers

### Platform Core

- AP Identity
- AP Tenancy
- AP Auth
- AP Permissions
- AP Events
- AP Audit
- AP Configuration
- AP Secret References

### Intelligence

- AP Memory
- AP Guard
- AP Conversation
- AP Workflow
- AP Knowledge
- AP Planning
- AP Automation
- AP Transcription
- AP Translation

### Channels

- AP WhatsApp
- AP Instagram
- AP Facebook
- AP Messenger
- AP Email
- AP WebChat
- AP Voice
- AP Push
- AP SMS

### Assets and Business APIs

- AP Files
- AP Media
- AP Storage
- AP CRM
- AP Finance
- AP Commerce
- AP Documents
- AP Calendar
- AP Tasks
- AP Notifications
- AP Analytics
- AP Radar

### Developer Platform

- AP Gateway
- AP Developer Portal
- AP API Console
- AP OpenAPI Registry
- AP SDKs
- AP Sandbox
- AP CLI
- AP Usage
- AP Billing
- AP Observability

## Domain boundaries

1. A domain owns its data, contracts and invariants.
2. Domains communicate through versioned contracts.
3. Cross-domain database access is forbidden by default.
4. Shared services do not contain product-specific business rules.
5. Products consume platform capabilities and may add presentation, personality and product workflows.

## Allowed dependencies

- Products may depend on engines, channels and services.
- Engines may depend on core, events, audit, memory and guard.
- Channels may depend on core, events and audit.
- Business APIs may depend on core, events and audit.
- Core domains do not depend on products, channels or business APIs.

## Forbidden dependencies

- Platform code depending on `uni.` or any product brand.
- Shared credentials or global provider tokens.
- Direct provider calls without an adapter.
- Cross-tenant data access.
- Business rules implemented inside core packages.

## Multi-tenant rules

- Every private request carries `tenant_id`.
- `tenant_id` is opaque.
- Identity does not imply tenant access.
- Connections, credentials, memory, events, assets and audit are tenant-scoped.
- `uni.`, `uni.co`, `imuni.` and `uni.juri` are not privileged tenants.

## Event-driven integration

All asynchronous cross-domain integrations use the AP Events canonical envelope.

Required fields:
- `event_id`
- `event_type`
- `event_version`
- `tenant_id`
- `request_id`
- `correlation_id`
- `causation_id`
- `occurred_at`
- `producer`
- data`

## Provider adapters

External providers are isolated behind adapters.

Examples:
- AP WhatsApp → Meta, WATI, Twilio or another provider.
- AP Payments → Mercado Pago, Stripe or another provider.
- AP AI Provider → OpenAI, Anthropic, Google or another provider.

## Product consumers

- `uni.`
- `uni.co`
- `imuni.`
- `uni.juri`
- `uni.verso`
- external customers

Products cannot own shared platform implementations.

## Migration rule

No legacy component is removed until a compatible replacement is tested with backup, smoke tests, rollback and operational evidence.
