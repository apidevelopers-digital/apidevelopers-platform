# Uni SaaS Customer Account + Media E2E v1

Status: WORKING CONTRACT
Date: 2026-09-11
Platform base: `main @ d320a7a64d7ae7bbdfe7c53a9d77595661fadb04`
Site base: `site_uni/main @ 213ac5cdde833448af94fb8854ee3b185bd8ada5`

## Objective

Deliver one complete customer capability:

`verified human login -> customer account -> tenant/organization/workspace -> role/permissions -> Conta uni. session -> media upload -> Campaign V4 -> quota reservation -> publication intent -> provider/VNNOX -> provider outcome -> customer-visible proof`

This wave is not complete because isolated files, routes, campaigns or previews exist. It is complete only when the customer journey is auditable end to end.

## Confirmed reusable foundation

- Product identity is `product:uni-co`.
- Governed provisioning route exists at `POST /v1/saas/uni-co/provision`.
- SaaS runtime already persists tenant, workspace, subscription, entitlement and provisioning jobs.
- Membership runtime already persists user, role, membership and access relationships.
- Browser handoff and account access-context preview compositions exist.
- `site_uni` already contains the governed media contracts for upload, campaigns, quota, publication intent and provider outcome.
- Campaign V4 creation was separately validated in controlled preview.

## Non-negotiable identity boundary

Customer account creation MUST NOT use an API key, service principal, demo fixture or hard-coded human as a substitute for a verified human session.

The account activation input must come from a verified human-session provider and carry only non-secret canonical references needed for provisioning and later access-context resolution.

The current human-session-provider gap remains a blocker for a real customer E2E until cleared.

## Customer account activation contract

The customer-account layer MUST reuse the existing Uni provisioning route instead of creating a second SaaS database or tenancy model.

Required inputs from the verified server-side identity/context layer:

- opaque `subjectRef` suitable for the existing provisioning contract;
- canonical tenant/customer binding;
- canonical organization binding resolvable after provisioning;
- workspace binding;
- display name;
- idempotency key;
- market/locale context when required by the site runtime.

Expected output must resolve, without secrets:

- `principalId`;
- `tenantId`;
- `organizationId`;
- `workspaceId`;
- active customer membership/role;
- access grant;
- `productId = product:uni-co`;
- entitlement/plan context.

The browser MUST NOT choose tenant, organization, provider, VNNOX player or privileged scopes.

## Media authority required for this wave

The canonical customer media vocabulary already defined by `site_uni` is:

- `files.read`
- `files.write`
- `campaigns.read`
- `campaigns.write`
- `assets.read`
- `assets.publish`
- `analytics.read`

Possession of a role name alone is insufficient. Every write still requires the authenticated session, active plan/capability, quota and entitlement checks defined by the media contracts.

## Acceptance gates

### U1 — Verified human session

- human session is authenticated, not an API/service credential;
- no password, token, raw biometric or provider secret is emitted to `site_uni`;
- assurance/trust evidence is canonical;
- tenant and organization resolve without cross-tenant fallback.

### U2 — Customer account provisioning

- verified customer can provision or recover the same account idempotently;
- tenant/workspace/principal bindings are deterministic;
- replay does not create duplicate customer records;
- conflicting replay fails closed;
- no automatic production write is enabled by default.

### U3 — Login, handoff and access context

- login completes browser handoff with S256;
- redemption is one-time and server-authenticated;
- Conta uni. receives a local session with no secret material;
- access-context resolves tenant, organization, workspace, membership, role, permissions and entitlement;
- logout/revocation removes access.

### U4 — Media account authority

- the authenticated customer sees only assets/screens belonging to the resolved organization;
- media write permissions are derived server-side;
- missing permission, inactive plan or missing entitlement fails closed.

### U5 — Campaign V4 under real customer context

- Campaign V4 no longer uses demo context;
- create returns `received`;
- replay is idempotent;
- conflicting replay returns conflict;
- organization, account, plan and quota are taken from the real authenticated context.

### U6 — Upload + quota + publication intent

- customer upload is private and outside `DOCUMENT_ROOT`;
- MIME/size/quota policies pass;
- quota reservation is durable and idempotent;
- publication intent binds one file, one campaign and authorized target assets;
- browser cannot submit provider identifiers.

### U7 — Governed provider/VNNOX publication

- provider adapter consumes only validated intents;
- canonical asset -> VNNOX solution/player mapping is server-side;
- publish retries are idempotent;
- kill switch and failure states are observable;
- no secret reaches the browser.

### U8 — Outcome + proof

- accepted/rejected/cancelled provider outcome is persisted;
- customer sees current publication status;
- proof-of-play is tenant isolated and customer visible;
- one controlled E2E proves login -> campaign -> publication -> outcome.

## Safety boundary

This working contract authorizes development and tests only.

It does NOT authorize:

- production customer creation;
- real billing;
- deployment;
- DNS changes;
- real VNNOX publication;
- production provider write;
- merge;
- sending customer communications.

Those actions require separate explicit approval.

## First implementation increment

Build the customer-account activation/wiring around the existing Uni provisioning route, fail-closed unless the caller provides a verified human identity/context. Then connect it to the existing handoff/access-context preview stack.

Do not advance Campaign V4 to real publication until U1-U4 are green under the same customer identity.
