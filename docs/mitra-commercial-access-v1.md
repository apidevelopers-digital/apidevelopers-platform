# Mitra Commercial Access v1

Status: working architecture contract
Date: 2026-09-08
Base: main @ 5999848cff9d21fff2fa3508e1e463c1e19f7bbf

## Capability

This front exists to deliver one end-to-end commercial capability:

Mitra public -> choose plan -> checkout intent -> account -> commercial confirmation -> tenant/workspace provisioning -> membership + entitlement -> login -> Mitra Office -> private tenant-scoped capability.

Landing pages or isolated screens do not complete this front.

## Current evidence

Confirmed in main:
- Mitra public landing/research exists.
- API Gateway CI and Platform Baseline CI are green on the reanchored HEAD.
- Shared contracts exist: auth-context, saas-commercial, saas-provisioning, saas-membership, saas-tenancy and saas-access.
- Shared saas-runtime exists.
- PR #416 remains OPEN + DRAFT as the older public-landing plan.

Pending:
- Mitra plan catalog.
- Mitra commercial facade.
- Mitra account/login journey.
- Mitra provisioning and entitlements.
- Private Mitra Office.
- Controlled purchase-to-login E2E.
- Real payment integration.

## Reuse rule

Do not create a parallel SaaS. Reuse:
- packages/contracts/src/auth-context.mjs
- packages/contracts/src/saas-commercial.mjs
- packages/contracts/src/saas-provisioning.mjs
- packages/contracts/src/saas-membership.mjs
- packages/contracts/src/saas-tenancy.mjs
- packages/contracts/src/saas-access.mjs
- packages/saas-runtime/src/access.mjs
- packages/saas-runtime/src/membership.mjs
- packages/saas-runtime/src/runtime.mjs

The Zuni commercial activation is reference only, never the Mitra product contract.

## Target architecture

Public app:
- product, plans, "Start now" and "Sign in";
- public legal research remains available;
- browser never supplies trusted price or private credentials.

Commercial facade:
- receives canonical planId plus minimum buyer identity;
- creates idempotent checkoutIntent;
- resolves price/plan server-side from canonical catalog;
- defaults to dry-run/assisted payment;
- only provisions after valid commercial confirmation.

Identity/session:
- canonical auth/identity;
- principalId-bound revocable session;
- tenant/workspace resolved server-side;
- private access denied without membership and entitlement.

Provisioning:
principal -> tenant -> workspace -> membership(owner) -> subscription -> entitlements

Mitra Office:
- authenticated workspace shell;
- shows current tenant/workspace;
- at least one real private tenant-scoped operation;
- same operation denied without session/membership/entitlement.

## Acceptance gates

G1 Offer/entry - 10%
- canonical Mitra planIds;
- Start now begins commercial journey;
- Sign in opens login;
- browser price is not trusted.

G2 Checkout intent - 15%
- server-side idempotent checkoutIntent;
- plan/value resolved from canonical catalog;
- no real charge in CI/test/dry-run;
- replay does not create duplicate subscription.

G3 Account/auth - 15%
- account create/confirm and login work;
- session is revocable;
- client cannot freely choose tenant;
- auth failure cannot open private workspace.

G4 Provisioning - 20%
- tenant/workspace/membership/subscription/entitlements are created idempotently;
- partial failure does not release incomplete access.

G5 Entitlement/access - 15%
- Office requires session + membership + entitlement;
- cross-tenant access is denied;
- authorization is server-side.

G6 Private Office - 15%
- successful login opens Mitra Office;
- real tenant/workspace is visible;
- one private tenant-scoped capability works;
- logout/direct unauthenticated call removes/denies access.

G7 Controlled E2E - 10%
In test/preproduction:
plan -> controlled checkout -> account -> provisioning -> login -> Office -> private capability
with auditable evidence for every transition.

G8 Real payment/production is a separate production gate and requires explicit approval.

## Safety for this stage

Not authorized by this architecture step:
- real charge;
- production customer creation;
- deploy;
- DNS;
- secrets;
- email/WhatsApp send;
- production publication;
- merge.

Payment implementation starts with mocks/adapters or dry-run/assisted mode.

## First implementation increment

Implement G1 + G2 only:
canonical Mitra plan catalog + idempotent checkoutIntent, with no real charge.

Only after that advance to G3/G4.
