# Mitra Preview Login Success Evidence

Date: 2026-09-19
Repository: apidevelopers-digital/apidevelopers-platform
Component: API Gateway Runtime / Mitra Preview
Surface: https://mitra-preview.apidevelopers.digital

Status

Mitra preview login was confirmed to succeed after the Gateway Runtime was published from:

```txt
64fe412b75962f6a0f7c1423cd0b6f11dd64540
```

The publish was executed by:

```txt
API Gateway Runtime Publish Pinned #61
```

Operational boundaries

- DNS was not changed.
- Primary production was not published by order.
- The test was performed on the Mitra preview surface.

Change that enabled the success

The final fix scoped Mitra preview provisioning by mediating two collisions between UniCo and Mitra SaaS resources:

```txt
UniCo -> workspaceSlug original + web-chat
Mitra -> workspaceSlug-mitra + web-chat-mitra
```

This avoids reusing a UniCo workspace or entitlement when provisioning for Mitra.

Previous blockers resolved

- The diagnostic was refined from generic/assisted provisioning failures into safe mapped reasons.
- The product mismatch was traced to entitlement binding.
- The entitlement collision was fixed by using `web-chat-mitra` for Mitra.
- The remaining membership failure was traced to workspace/product binding.
- The workspace collision was fixed by using a product-scoped workspace slug for Mitra.

Current outcome

The user confirmed that the Mitra preview logged in successfully after the publish of:

```txt
64fe412b75962f6a0f7c1423cd0b6f11dd64540
```

Not regitered in this evidence

- Primary production rollout.
- DNS changes.
- UniCo regression pass outside the CI suite.
- Formal release tag.

Recommended next step

Run a light stability/regression pass on the preview surfaces before any formal production rollout.
