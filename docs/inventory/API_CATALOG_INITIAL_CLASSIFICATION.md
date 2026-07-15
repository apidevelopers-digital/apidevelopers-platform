# API Catalog Inventory - Initial Classification

Status: ACTIVE
Date: 2026-07-15
Source: apidevelopers-digital/public/api/catalog.json

## Current catalog entries

| Entry | Current status | Current type | Target classification |
|---|---|---|---|
| uni.co | foundation | universal assistant | apps/unico-assistant |
| uni.radar | online | observability product/service | services/radar |
| uni.juri | online | legal vertical | product consumer of Legal APIs |
| imuni. | online | health vertical | product consumer of Health APIs |
| uni.media | online | media product/service | split product UI and Media API |
| uni.games | online | domain API/product | review and neutralize naming |
| uni.culinary | online | domain API/product | review and neutralize naming |
| uni.memory | online | shared platform service | services/memory |
| uni.janela | planned | customer-facing product | uni. web platform |
| uni.descko | private | private product | review |
| uni.letra | planned | domain product/API | review |

## Important finding

The catalog mixes technical services, engines, commercial products and regulated verticals.
The status "online" in the portal does not by itself prove production readiness.

## Global target services

### WhatsApp API

Target: services/channels-whatsapp

Requirements:
- official Meta WhatsApp Business Platform integration
- multiple customer accounts and phone numbers
- tenant isolation
- webhook normalization
- media ingestion and delivery
- translation and transcription adapters
- human handoff
- templates, sessions and delivery status
- audit, rate limits and idempotency
- no dependency on WATI for the commercial platform

Current WATI 5001 remains a uni. operational compatibility adapter until migration is complete.

### Instagram API

Target: services/channels-instagram

Requirements:
- multiple business and creator accounts
- tenant isolation
- messaging, comments, media and publishing
- webhook normalization
- media processing
- permissions and token lifecycle
- human handoff
- audit, rate limits and idempotency
- shared identity, conversation and memory contracts

## Naming direction

Neutral technical names belong to API Developers.digital.
Customer-facing product names may use uni., uni.co, imuni. and uni.juri.

## Migration priority

1. contracts, identity and tenancy
2. events, audit, guard and memory
3. conversation and workflow engines
4. uni.co assistant runtime
5. WhatsApp API
6. Instagram API
7. radar and observability
8. product consumers: uni., imuni. and uni.juri
