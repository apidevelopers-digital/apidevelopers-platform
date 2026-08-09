# NEXUS Global Context + Scoped Memory v1

Status: implementation foundation / review  
Authority: `apidevelopers-institution/architecture/NEXUS_UNICO_GLOBAL_AGENT_FEDERATION_V1_2026-08-09.md`  
Production activation: not authorized

## Scope

This slice turns the multinational agent architecture into deterministic contracts inside `@apidevelopers/kernel-memory`.

It adds:

- Global Context v1: `language`, `locale`, `market`, `country`, `timezone`, `currency`, `regulatoryRegion`, `languageTier`;
- Scoped Memory Envelope v1: tenant, agent, channel, conversation, correlation, memory scope, consent and opaque references;
- governed handoff read between agents;
- fail-closed access decisions.

Memory scopes are `working`, `customer`, `episodic`, `semantic` and `handoff`.
Language tiers are `certified`, `supported` and `best_effort`.

## Invariants

- language does not create another agent identity;
- NEXUS and uni.co remain distinct agents;
- cross-tenant reads are blocked;
- cross-agent reads are blocked by default;
- only a handoff envelope with `handoff:read` may be read by its destination agent;
- outputs are immutable;
- raw message text, transcript, phone, email and arbitrary fields are not accepted by the envelope;
- the contract does not authorize mutation or external execution.

## Continuity path

1. contract + invariants;
2. append-only integration with existing SHA-256 memory chain;
3. governed persistence adapter;
4. NEXUS/6610 runtime adapter;
5. operator read diagnostics;
6. Smart Handoff Link tokenization;
7. uni.co/5001 consumer adapter;
8. multilingual end-to-end evaluation.

Each slice requires tests and GitHub evidence before activation of the next slice.

## Not included

No database migration, deploy, WhatsApp send, CRM write, automatic handoff, W3/W4 communication or production activation is included here.
