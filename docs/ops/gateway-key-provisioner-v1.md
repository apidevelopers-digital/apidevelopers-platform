# Gateway Key Provisioner v1

Status: implemented core + dry-run operator workflow  
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

## Operator workflow

Workflow:

```txt
.github/workflows/gateway-key-provisioner.yml
```

Current mode:

```txt
dry-run only
```

Approval phrase for dry-run:

```txt
IGOR_APROVA_GATEWAY_KEY_PROVISIONER_DRY_RUN
```

The dry-run workflow emits only sanitized `GATEWAY_KEY_PROVISIONER_*` lines.

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

`scripts/ops/gateway-key-provisioner.mjs` and `.github/workflows/gateway-key-provisioner.yml` provide a dry-run operator surface.

This version intentionally does **not** issue a real key. Real issuance must be wired to the runtime lifecycle service in a follow-up change with separate approval.
