# Migration Backlog

Status: active
Date: 2026-07-15
Owner: API Developers.digital

## P0 — Foundation

| ID | Capability | Delivery | Depends on | Done when |
|---|---|---|---|---|
| CORE-001 | Contracts | Canonical schemas and versioning | none | schemas validated and documented |
| CORE-002 | Identity | Users, service accounts and auth contracts | CORE-001 | auth tests and tenant isolation pass |
| CORE-003 | Tenancy | Organizations, tenants and permissions | CORE-001 | cross-tenant access is blocked |
| CORE-004 | Events | Canonical event envelope | CORE-001 | correlation and causation are supported |
| CORE-005 | Audit | Durable append-only audit | CORE-004 | immutable evidence can be queried |
| AI-001 | Memory | Persistent, revocable and auditable memory | CORE-002, CORE-003, CORE-005 | retention and revocation tests pass |
| AI-002 | Guard | Policy and approval gates | CORE-002, CORE-003, CORE-005 | R4/R5 controls are tested |

## P1 — Intelligence and Channels

| ID | Capability | Delivery | Depends on | Done when |
|---|---|---|---|---|
| ENG-001 | Conversation | Conversation Engine v1 | AI-001, AI-002 | contract, tests and events pass |
| ENG-002 | Workflow | Workflow Engine v1 | CORE-004, CORE-005, AI-002 | state, approval and rollback tests pass |
| CH-001 | WhatsApp | Multi-tenant WhatsApp API | CORE-002, CORE-003, CORE-004 | multiple WABAs and numbers are isolated |
| CH-002 | Instagram | Multi-account Instagram API | CORE-002, CORE-003, CORE-004 | OAuth, publishing and webhook tests pass |
| APP-001 | uni.co | Assistant runtime on platform services | ENG-001, ENG-002, AI-001, AI-002 | no shared service is implemented inside the product |

## P2 — Business and Developer Platform

| ID | Capability | Delivery | Depends on | Done when |
|---|---|---|---|---|
| BUS-001 | Radar | Collector, scoring and query services | CORE-004, CORE-005 | runtime schema creation is removed |
| BUS-002 | Media | Media and asset APIs | CORE-002, CORE-003 | tenant isolation and asset versioning pass |
| DEV-001 | Gateway | Versioned public gateway | CORE-002, CORE-003 | auth, limits and observability pass |
| DEV-002 | Developer Portal | Docs, keys, sandbox and usage | DEV-001 | external developer onboarding works |

## Migration rule

No production component is removed before dependency inventory, backup, compatibility validation, smoke tests and rollback evidence.
