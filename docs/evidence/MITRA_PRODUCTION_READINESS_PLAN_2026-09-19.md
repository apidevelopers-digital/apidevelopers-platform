# Mitra Production Readiness Plan

Date: 2026-09-19
Repository: apidevelopers-digital/apidevelopers-platform
Scope: Mitra preview to production readiness
Operational status: plan only

## Status

Mitra preview login has been confirmed to work after Gateway Runtime publish #61.

Confirmed preview runtime SHA:

```txt
64fe412b75962f6a0f07c1423cd0b6f11dd64540
```

Documented marker:

```txt
docs/evidence/MITRA_PREVIEW_LOGIN_SUCCESS_2026-09-19.md
```

## Important operational boundaries

- This is a preparation document.
- This document does not publish production.
- This document does not change DNS.
- This document does not change Gateway Runtime.
- Any production publish, DNS change, rollback or customer-facing change requires new explicit approval.

## Production readiness objective

Controlledly prepare the Mitra flow for a future production rollout while preserving the confirmed preview success and avoiding regressions to UniCo or the API Gateway.

## Currently confirmed

- Mitra preview login is working.
- Gateway Runtime publish #61 succeeded.
- The published runtime reflects SHA `64fe412b75962f6a0f07c1423cd0b6f11dd64540`.
- Mitra preview is isolated from UniCo by product-scoped workspace and entitlement:

```txt
UniCo -> workspaceSlug original + web-chat
Mitra -> workspaceSlug-mitra + web-chat-mitra
```

- DNS was not changed during the preview fix.
- Primary production was not published during the preview fix.

## Readiness checklist

Before any production rollout, confirm:

### 1. Code / CI

- Platform Baseline CI is green on the candidate commit.
- API Gateway CI is green on the candidate commit.
- Managed Hosting CI is green or explicitly deemed not a production gate for the change.
- The candidate SHA is explicitly pinned in the rollout instruction.

### 2. Preview stability

- Mitra preview login still succeeds on hard refresh.
- Mitra preview returns no new assisted-provisioning error.
- Mitra preview is verified in at least one clean session or incognito browser session.

### 3. UniCo regression

- UniCo preview or existing UniCo Gateway flow remains operational.
- UniCo provisioning continues to use the original workspace slug.
- UniCo provisioning continues to use the `web-chat` entitlement capability.

### 4. Mitra resource isolation

- Mitra provisioning uses a Mitra-scoped workspace slug.
- Mitra provisioning uses `web-chat-mitra` entitlement capability.
- Mitra auth does not reuse an old UniCo entitlement.
- Mitra access grant is bound to `product:mitra`.

### 5. Observability

- The frontend diagnostic continues to expose only safe reason codes.
- No passwords, tokens, cookies, bearers, raw emails, tenant ids, workspace ids, principal ids or grant ids are exposed.
- Mapped diagnostic codes remain safe patterns.

### 6. Rollback

- The previous Gateway Runtime SHA is known.
- Rollback instructions refer to a pinned SHA, not to a floating branch.
- DNS rollback is not assumed as a Gateway rollback step.
- Any rollback is also a sensitive action and requires explicit approval.

## Proposed rollout gates

Do not proceed to production until all of the following are true:

- [ ] The published preview runtime SHA is explicitly approved as candidate.
- [ ] Mitra preview login has been re-tested and confirmed successful.
- [ ] UniCo regression check has been performed.
- [ ] Rollback SHA is pinned in the operational plan.
- [ ] No active blocking CI or readiness diagnostic remains on the candidate.
- [ ] Production publish command is explicitly approved by Igor.
- [ ] DNS change, if any, is separately approved by Igor.

## Candidate SHA

Current preview-validated Gateway Runtime SHA:

```txt
64fe412b75962f6a0f07c1423cd0b6f11dd64540
```

Note: `main` may be ahead of this SHA due to documentation-only commits. Production should pin the actual runtime candidate SHA, not a documentation-only commit.

## Rollback plan

If a rollback is required:

1. Block further rollouts.
2. Identify the last known good Gateway Runtime SHA.
3. Perform a Gateway Runtime Publish Pinned to the last known good SHA, only after explicit approval.
4. Confirm `deploy/hostinger-gateway-runtime/SOURCE_SHA`.
5. Retest Mitra preview and UniCo flows.
6. Document the rollback result.

## Operational recommendation

Keep the first production rollout scoped to Gateway Runtime only. Avoid DNS changes until Mitra and UniCo are stable after the Gateway rollout.

## Remaining protections

- DNS change is blocked until explicitly approved.
- Production publish is blocked until explicitly approved.
- Rollback is blocked until explicitly approved.
- Any customer-facing change must be announced and checked before execution.
