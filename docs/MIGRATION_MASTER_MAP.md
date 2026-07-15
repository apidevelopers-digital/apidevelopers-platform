# Migration Master Map

Status: Active
Date: 2026-07-15
Owner: API Developers.digital

## Goal

Move reusable technology from the legacy ecosystem into `apidevelopers-platform` without interrupting `uni.` production services.

## Classification

- `MIGRATE_PLATFORM`: move to API Developers.digital
- `MIGRATE_UNI`: move to `uni.` repositories
- `KEEP_LEGACY`: keep temporarily for compatibility
- `REVIEW`: destination not yet confirmed
- `SUPERSEDED@: replaced by a newer implementation
- `ARCHIVE`: historical only

## Initial map

| Source | Destination | Classification | Priority | Risk | Notes |
|---|---|---:|---:|---:|---|
| `unico-api-platform/docs/uni-core` | `packages/contracts` | MIGRATE_PLATFORM | P0 | R2 | Rename to neutral contracts |
| `unico-api-platform/site/runtime-php/conversation-engine`9🌟| `engines/conversation` | MIGRATE_PLATFORM | P0 | R3 | Tests and HTTP orchestrator required |
| `unico-api-platform/site/runtime-php/workflow-engine` | `engines/workflow` | MIGRATE_PLATFORM | P0 | R3 | Finish tests before migration |
| `unico-api-platform` memory modules | `services/memory` | MIGRATE_PLATFORM | P0 | R3 | Preserve tenant and approval rules |
| `unico-api-platform` guard modules | `services/guard` | MIGRATE_PLATFORM | P0 | R4 | Human approval remains mandatory |
| `unico-api-platform` radar runtime | `services/radar` | MIGRATE_PLATFORM | P1 | R3 | Separate runtime from `uni.` UI |
| Meta WhatsApp integration | `services/channels-whatsapp` | MIGRATE_PLATFORM | P1 | R3 | Keep WATI 5001 operational in `uni.` |
| Instagram integration | `services/channels-instagram` | MIGRATE_PLATFORM | P1 | R3 | Neutral platform service |
| `sitedauni.com` marketplace | future `uni-web-platform` | MIGRATE_UNI | P0 | R3 | Commercial product |
| Uni Janela and operator UI | future `uni-web-platform` or `uni-janela`9🌟| MIGRATE_UNI | P0 | R3 | Customer-facing product |
| WATI 5001 bridge | `uni.` operations | KEEP_LEGACY | P0 | R3 | Do not break current WhatsApp |
| VNNOX operational bridge | REVIEW | REVIEW | P1 | R3 | Platform service or `uni.` operation |
| Mercado Pago integration | REVIEW | KEEP_LEGACY | P0 | R4 | No production change before full mapping |
| legacy Hostinger patches | archive area | REVIEW | P2 | R2 | Validate before archive |

## Migration order

1. Contracts
2. Events and audit
3. Memory
4. Guard
5. Conversation Engine
6. Workflow Engine
7. Radar
8. WhatsApp Meta
9. Instagram
10. Gateway and SDKs
11. `uni.` consumers

## Production safety

No production component is removed until:

- dependency inventory is complete;
- backup exists;
- compatible replacement is tested;
- rollback is documented;
- smoke test passes;
- explicit approval is recorded.
