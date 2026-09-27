# Mitra MCP v1 — public saved-token probe milestone

**Status:** confirmed  
**Date:** 2026-09-27  
**Repository:** `apidevelopers-digital/apidevelopers-platform`  
**Branch base:** `main`  
**Runtime deploy branch:** `deploy/hostinger-gateway-runtime`

## Scope

This milestone records the first confirmed public saved-token probe for the Mitra MCP v1 read-only routes:

- `GET /v1/mitra/mcp/status`
- `GET /v1/mitra/mcp/capabilities`

The validation is limited to the public read-only MCP routes and does not include legal adapters, Lex/Mitra external connections, DNS changes, database changes, or manual Hostinger operations.

## Evidence

| Evidence | Result |
|---|---|
| PR `#652` — `ops: annotate gateway key provisioner failures` | merged into `main` |
| Merge commit | `fd8f5ef6c62e8260e621e9cd3a4e145ad11bad51` |
| Key provisioner workflow run `#8` | completed with `success` |
| Key provisioner run ID | `36321486895` |
| Public saved-token probe workflow run `#11` | completed with `success` |
| Public saved-token probe run ID | `36344761954` |
| Expected deployed runtime SHA | `994e97b4fcd07077104b0d876c1a4ae00dc4c6e9` |

## Secrets and scopes validated by the flow

The approved key provisioner flow was used to issue/store/verify the saved read tokens required by the gateway flow, including the dedicated MCP v1 read token:

- `ADA_MITRA_BRIDGE_READ_TOKEN`
- `ADA_MITRA_MCP_V1_READ_TOKEN`

Expected scopes for the MCP v1 read-only probe:

- `ada:mitra:read`
- `mitra:status:read`
- `mitra:capabilities:read`

## Outcome

The previous public failure mode (`403 insufficient_scope`) is treated as resolved for the two MCP v1 read-only routes based on the successful public saved-token probe run.

## Confirmed

- Hostinger gateway runtime has public MCP v1 read-only routes attached.
- Dedicated saved-token probe workflow ran successfully.
- The public probe validated the saved token path for `/status` and `/capabilities`.

## Still pending

- Do not connect Lex/Mitra external services yet.
- Do not start legal adapter implementation in this milestone.
- Do not modify DNS, database, or Hostinger manually from this milestone.
- Prepare the next PR separately for the first read-only legal adapter after this milestone is reviewed.

## Next recommended step

Open a separate PR for the first legal read-only adapter only after this documentation milestone is reviewed and merged.
