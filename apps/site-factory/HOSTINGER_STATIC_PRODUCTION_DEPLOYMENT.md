# Hostinger static production deployment

Status: prepared for review. This document does not prove a deployment occurred.

## Corrected routing decision

The generated API Developers.digital site is a React/Vite frontend whose production artifact is the pre-built `dist/` directory. It does not require a server-side Node.js runtime.

The official Hostinger deployment route for this artifact is therefore:

```text
GitHub Actions on igor-mac-runner
→ build and test React/Vite
→ ZIP the contents of dist/ with index.html at archive root
→ official hostinger-hosting-mcp
→ hosting_deployStaticWebsite
→ Hostinger upload-urls API + TUS upload
→ Hostinger /deploy API
→ HTTPS content verification
```

The previous `nodejs/builds/from-archive` route was the wrong deployment class for this artifact. It expects a Node.js source application and a Hostinger-side build.

## Production target

- Domain: `apidevelopers.digital`
- Hosting username: `u242521810`
- Current root: `/home/u242521810/domains/apidevelopers.digital/public_html`
- Current WordPress software ID: `29782684`

The static deploy overwrites the website files in `public_html`. The workflow does not delete the WordPress database or remove the WordPress installation record. WordPress removal, if still desired after successful validation, is a separate destructive operation and requires separate approval.

## Safety gates

The workflow defaults to `preflight` and performs no Hostinger write.

A real production apply requires all of the following:

1. `mode=apply`;
2. `approved_sha` exactly matching the workflow commit SHA;
3. `approval=IGOR_APROVA_HOSTINGER_STATIC_PRODUCTION_DEPLOY`;
4. the `HOSTINGER_API_TOKEN` GitHub Actions secret;
5. execution on `igor-mac-runner` labels `self-hosted`, `macOS`, `X64`.

## Evidence

Each run uploads a sanitized JSON artifact containing:

- exact GitHub SHA and run ID;
- archive name, size and SHA-256;
- confirmation that `index.html` is at archive root;
- official MCP package version and discovered tool schema;
- whether a destructive write was executed;
- sanitized tool response;
- HTTPS status, content match and response-body SHA-256.

Tokens and authorization values are excluded or redacted.
