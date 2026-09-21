# Gateway Key Provisioner v1

Status: proposed  
Repository: `apidevelopers-digital/apidevelopers-platform`  
Initial use case: ADA Mitra Bridge read-only key

## Context

The ADA Mitra Bridge endpoint is protected by the API Gateway. The current probe confirmed:

- `x-api-key` and `x-tenant-id` authenticate the delegated gateway key;
- the delegated key does not have `ada:mitra:read`;
- the required outcome is a dedicated least-privilege key, not a broad shared key.

## Decision

Create an institutional Gateway Key Provisioner flow. The provisioner is responsible for issuing durable gateway API keys with explicit tenant, name, scopes, approval, and audit metadata.

The first production key to issue through this flow is:

```txt
name: ada-mitra-bridge-read
scopes:
  - ada:mitra:read
```

## Operating model

1. Operator prepares a dry-run plan.
2. System validates tenant, key name, requested scopes, and allowlist.
3. Real issuance requires an exact approval phrase.
4. The API key secret is returned once.
5. The operator stores the secret in the required target secret manager.
6. The secret is never committed, logged, or repeated.
7. Verification is performed by a read-only probe.

## Secret destinations for the Mitra Bridge

```txt
GitHub repository: apidevelopers-digital/apidevelopers-platform
Repository secret: ADA_MITRA_BRIDGE_READ_TOKEN
Repository secret: ADA_MITRA_BRIDGE_TENANT_ID
```

## Security controls

- One key per integration/use case.
- Least-privilege scopes.
- Tenant boundary required.
- Dry-run first.
- Explicit approval for real issuance.
- One-time secret handling.
- No raw SQL.
- No environment dump.
- No production deploy as part of issuance.
- Probe verifies authorization after storage.

## Current implementation boundary

`apps/api-gateway/src/operator-api-key-provisioning.mjs` introduces the governed provisioner core around the existing `apikey-core` lifecycle service.

This PR does not deploy a public key-issuing endpoint. The HTTP/control-plane wiring should be added only after the core contract and tests are reviewed.
