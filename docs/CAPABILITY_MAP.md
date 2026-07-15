# Capability Map

Status: Active  
Date: 2026-07-15  
Owner: API Developers.digital

## Rule

A reusable capability belongs to API Developers.digital.  
A brand, customer experience, business rule or product-specific workflow belongs to the product.

## Capability inventory

| Capability | Domain | Status | Owner | Target | Priority |
|---|---|---|---|---|---|
| Identity | core | planned | API Developers.digital | `packages/auth + services/identity` | P0 |
| Tenancy | core | partial | API Developers.digital | `packages/tenancy` | P0 |
| Events | core | partial | API Developers.digital | `services/events` | P0 |
| Audit | core | partial | API Developers.digital | `services/audit` | P0 |
| Memory | intelligence | mvp | API Developers.digital | `services/memory` | P0 |
| Guard | intelligence | partial | API Developers.digital | `services/guard` | P0 |
| Conversation Engine | intelligence | mvp | API Developers.digital | `engines/conversation` | P1 |
| Workflow Engine | intelligence | mvp | API Developers.digital | `engines/workflow` | P1 |
| WhatsApp API | channels | partial | API Developers.digital | `services/channels-whatsapp` | P1 |
| Instagram API | channels | partial | API Developers.digital | `services/channels-instagram` | P1 |
| Radar / Observability | business | runtime_partial | API Developers.digital | `services/radar + packages/observability` | P1 |
| Media API | assets | contract_ready | API Developers.digital | `services/media` | P2 |
| Payments | business | legacy_integration | API Developers.digital | `services/payments + provider adapters` | P2 |
| uni.co Assistant | products | active_legacy | uni.co | `apps/unico-assistant` | P1 |
| uni. Web Platform | products | active | uni. | `future uni-web-platform` | P1 |
| uni. Mobile App | products | partial | uni. | `uni_cliente_app modernization` | P2 |

## Migration order

1. Contracts
2. Identity and tenancy
3. Events and audit
4. Memory and guard
5. Conversation Engine
6. Workflow Engine
7. uni.co assistant runtime
8. WhatsApp API
9. Instagram API
10. Radar and observability
11. Product consumers
12. Legacy cleanup

## Execution rule

No production component is removed before dependency inventory, backup, compatibility validation, smoke tests and rollback evidence.
