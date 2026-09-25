# Mitra MCP v1 — Inventory and Target Architecture

Status: initial target architecture
Date: 2026-09-25
Repository: `apidevelopers-digital/apidevelopers-platform`

## Objective

Standardize Mitra as an MCP-first legal product.

```txt
ChatGPT / Milena / client workspace
→ Mitra MCP app
→ ADA Mitra Legal Skill
→ API Developers Gateway
→ Mitra Legal Orchestrator / Lex Legal API / tenant services
```

## Current inventory

| Area | Component | Role |
| --- | --- | --- |
| Gateway and credentials | `apidevelopers-platform` | Gateway, key provisioner, secret writer, ADA Mitra Bridge and Hostinger runtime |
| Legal orchestration | `mitra-legal-orchestrator` | Mitra legal orchestration layer |
| Legal research API | `lex-legal-api` | Jurisprudence and official-source backend |
| Related assistant surface | `auma-whatsapp-peterle` | Related WhatsApp surface; integrate, do not duplicate |
| Public platform | TBD | Tenant, users, cases, documents, billing and connector management |
| ChatGPT integration | TBD MCP app/server | Tools exposed to ChatGPT and MCP clients |
| Legal method | TBD Skill | Work method, source validation and legal answer discipline |

## Validated foundation

The ADA Mitra / Gateway Key Provisioner front is operationally closed:

- Gateway Key Provisioner issued a dedicated Mitra read key.
- Organization Secret writing was validated.
- `ADA_MITRA_BRIDGE_READ_TOKEN` is stored as an Organization Secret for `apidevelopers-platform`.
- ADA Mitra Bridge validation passed after the real issue/store/verify flow.
- Hostinger runtime routes were corrected for ADA Mitra and Gateway Key Provisioner.
- Closeout is registered in `docs/ops/ada-mitra-gateway-key-provisioner-closeout-2026-09-24.md`.

No secret value is documented here.

## Product target

```txt
Mitra = legal orchestration and workflow
Lex = legal source/search engine
ADA/Gateway = identity, tenants, scopes, secrets and bridge
MCP = ChatGPT-facing tool contract
Skill = legal method and operating style
Public platform = account, users, cases, documents, connectors and billing
```

GPT Actions may remain a compatibility option only if explicitly needed. The strategic product path is MCP.

## MCP tools v1 target

| Tool | Purpose | Backend owner |
| --- | --- | --- |
| `mitra.status` | Check tenant/auth/runtime readiness | ADA Mitra Bridge / Gateway |
| `mitra.capabilities` | List enabled capabilities | ADA Mitra Bridge / Mitra |
| `mitra.list_connectors` | List legal/data connectors | ADA Mitra Bridge / Mitra |
| `mitra.search_jurisprudence` | Search jurisprudence and official sources | Lex Legal API |
| `mitra.summarize_jurisprudence` | Summarize selected judgment/source | Lex / Mitra |
| `mitra.compare_precedents` | Compare precedents and thesis differences | Mitra / Lex |
| `mitra.case_context` | Retrieve case/client context with permission boundaries | Mitra Orchestrator / platform |
| `mitra.analyze_document` | Analyze uploaded legal document | Mitra Orchestrator |
| `mitra.generate_thesis` | Generate structured thesis options | Mitra Orchestrator |
| `mitra.draft_motion` | Draft legal document using tenant context and cited sources | Mitra Orchestrator |
| `mitra.verify_sources` | Validate citations/sources and uncertainty | Lex / Mitra |

## Skill target

The ADA Mitra Skill defines the legal work method. It must not store secrets or replace backend tools.

It should define: missing-fact questions, fact/law/thesis separation, source citation discipline, uncertainty handling, anti-hallucination rules and human-lawyer escalation.

## Tenant, token and cost model

Clients should not manually copy backend tokens.

```txt
Client buys Mitra
→ tenant is created
→ users are invited
→ client connects Mitra MCP to ChatGPT/workspace
→ OAuth/session authorizes MCP usage
→ backend issues internal scoped credentials
→ usage is audited and billed
```

OpenAI API costs should only be incurred by API Developers when API Developers backend performs model work itself, such as embeddings, batch summarization, classification or server-side drafting. Normal ChatGPT + MCP usage should keep the ChatGPT/model session in the client's workspace context.

## Public platform target

The public Mitra platform should manage tenants, users, roles, cases, documents, legal connectors, MCP connection state, usage, billing, audit logs and credential rotation status.

No public domain is selected by this document.

## Non-duplication rules

- Do not rebuild legal source search inside MCP if Lex owns it.
- Do not duplicate tenant/secret governance inside Mitra if Gateway owns it.
- Do not let the Skill become a secret store or API client implementation.
- Do not make clients handle internal gateway tokens.
- Do not expose raw secret values in ChatGPT, logs, commits or artifacts.

## Recommended next sequence

1. Audit Mitra and Lex route contracts.
2. Decide MCP server/app repository location.
3. Implement `mitra.status`, `mitra.capabilities` and `mitra.list_connectors`.
4. Add tenant-aware authorization for MCP calls.
5. Add first legal tool: `mitra.search_jurisprudence`.
6. Create the ADA Mitra Legal Skill.
7. Add Milena internal test workspace.
8. Add public tenant onboarding.
9. Add usage and billing counters.
10. Replace transitional PAT-based secret writer with GitHub App or MCP credential broker.

## Readiness

| Front | Status |
| --- | --- |
| ADA Mitra bridge/key/secret foundation | Operationally ready |
| Mitra MCP product | Not yet consolidated |
| Legal Skill | Not yet created |
| Public tenant/billing platform | Target architecture pending |
| GitHub App / credential broker governance | Future hardening |

Operational foundation is ready. Mitra MCP v1 is the next implementation front.
