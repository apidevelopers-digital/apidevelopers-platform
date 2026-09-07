# Mitra Public Product Plan

**Status:** candidate / planning only  
**Target domain:** `mitra.apidevelopers.digital`  
**Repository:** `apidevelopers-digital/apidevelopers-platform`  
**Production activation:** not authorized by this document

## 1. Objective

Prepare Mitra as a public commercial legal-assistant product with a clear path from public landing to authenticated SaaS use, while preserving strict separation from private office/client data.

This plan covers:

- public landing page;
- login entry point;
- commercial chatbot;
- public legal research experience;
- future subscription/SaaS path;
- integration boundaries with existing Mitra services.

It does **not** authorize DNS, deploy, production publishing, database mutation, billing, customer provisioning, or real authentication activation.

## 2. Product boundary

### Mitra Public

Public mode must operate without private client databases.

Primary capabilities:

- public legal research;
- public-source navigation/search;
- commercial chatbot;
- product explanation and lead capture;
- login entry point;
- plans/pricing surface when commercial rules are approved.

Public legal research sources may include the existing public legal gateway in:

- `homosapiens-id/porta-juridica-publica`

Known public API surface includes routes such as:

- `/health`
- `/sources`
- `/search/global`
- `/search/datajud/processo`
- `/search/legislacao`
- `/search/proposicoes`
- `/search/datasets`
- `/search/dou`
- `/normalize/citation`

Production HTTPS/readiness of that public gateway must be verified separately before integration is treated as production-ready.

### Mitra Office

Private office mode remains a separate trust/data boundary.

It may include:

- clients;
- memories;
- documents;
- cases/processes;
- internal client search;
- confirmation before persistence;
- navigation by client/case/document;
- jurimetrics tied to authorized private context.

Public mode must not infer or obtain access to private office data merely because a login surface exists.

## 3. Existing backend direction

Do not create a new Node backend for this slice.

Existing operational backend:

- `https://peterle-ops.apidevelopers.digital`
- repository: `apidevelopers-digital/peterle-ops-api`

Existing Mitra operational work already supports client-name resolution in the private/office flow. This public product plan does not change those private contracts.

## 4. Shared platform alignment

The public Mitra surface should reuse institutional platform contracts instead of creating product-specific substitutes where shared capabilities already exist.

Relevant current platform direction includes:

- shared identity;
- tenant/workspace boundaries;
- user/role/permission/session;
- subscription and entitlement contracts;
- audit and observability;
- files, notifications and feature flags.

Login must be treated as an entry surface first. Real authentication activation requires a separately reviewed implementation and explicit production approval.

NEXUS/global memory contracts establish scoped memory and fail-closed access behavior. Mitra must preserve product identity and tenant/client isolation; no cross-tenant or cross-agent read should be introduced by this landing slice.

## 5. Frontend/site-factory direction

Use the GitHub-first Site Factory conventions as the preferred starting point for the public web surface.

Current reusable baseline:

- React/Vite;
- preview required;
- build/test/healthcheck before promotion;
- explicit Igor approval policy;
- rollback by commit;
- dry-run as the default planning mode.

The initial Mitra landing implementation should be created as an isolated app/project and must not publish automatically.

Suggested public information architecture:

1. Hero: Mitra positioning and primary CTA.
2. Capabilities: legal research, navigation, jurimetrics, operational assistance.
3. Public research: explain supported public sources and scope.
4. How it works: public use -> login -> contracted/private workspace.
5. Security/data boundary: public mode has no private client database access.
6. Commercial chatbot: product guidance, qualification and handoff.
7. Plans/pricing placeholder: no live billing until approved.
8. Login entry point: UI only until auth integration is explicitly approved.

## 6. Chatbot commercial boundary

The public chatbot is commercial/product-oriented by default.

Allowed planning scope:

- explain Mitra;
- demonstrate public legal-search capabilities;
- qualify leads;
- route users toward login/contracting;
- answer product questions from approved public information.

It must not:

- expose private Peterle/client context;
- write to private client memory;
- silently create clients;
- persist sensitive information without an approved confirmation flow;
- represent legal research output as private-office knowledge when no authorized context exists.

## 7. Delivery slices

### Slice 1 — Product plan

This document only.

Acceptance:

- domain and product boundary documented;
- backend reuse documented;
- public/private separation documented;
- no production mutation.

### Slice 2 — Landing visual

Prepare React/Vite landing in preview/dry-run workflow.

Acceptance:

- responsive landing;
- clear public/private boundary;
- commercial CTA and login placeholder;
- no production publication.

### Slice 3 — Login/auth

Integrate with approved shared identity/session contracts.

Acceptance:

- reviewed auth flow;
- explicit tenant/workspace context;
- no private data leak from public mode;
- tests and audit evidence.

### Slice 4 — Commercial chatbot

Connect approved public-product knowledge and public legal-search capabilities.

Acceptance:

- public-only context by default;
- safe lead handoff;
- no private persistence without confirmation.

### Slice 5 — Public legal backend

Integrate public legal gateway only after its HTTPS/production readiness is verified.

Acceptance:

- health/source checks;
- timeout/error states;
- citation/source normalization;
- no dependency on private client database.

### Slice 6 — Plans/pricing

Add commercial states only after subscription/entitlement rules are approved.

### Slice 7 — Production publication

DNS, Hostinger publication and production activation are separate actions and require explicit approval.

## 8. Security and approval gates

The following remain blocked without explicit approval:

- create/alter DNS or subdomain records;
- deploy or publish to production;
- enable real login/auth in production;
- mutate private databases;
- create real customer/client records;
- enable billing;
- send messages;
- promote preview to production.

Every promotion should preserve GitHub evidence, preview, checks and rollback path.

## 9. Immediate next implementation step

After review/merge of this plan, prepare the **Mitra public landing visual in preview-only mode**, using the Site Factory React/Vite conventions and without DNS or production deployment.
