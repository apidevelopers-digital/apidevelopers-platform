# ChatGPT Plugins - Validation Runbook

Draft operational runbook for the macroplugin registry and gateway in PR #768.

> Status: draft. Do not merge, deploy or connect to ChatGPT production without explicit approval.

## Macroplugins

- `ada-infra`
- `ada-juri`
- `ada-comunicacao`
- `ada-media`

## Current artifacts

Contracts:

- `apps/chatgpt-plugins/ada-infra/openapi.yaml`
- `apps/chatgpt-plugins/ada-juri/openapi.yaml`
- `apps/chatgpt-plugins/ada-comunicacao/openapi.yaml`
- `apps/chatgpt-plugins/ada-media/openapi.yaml`

Gateway draft:

- `apps/api-gateway/src/plugin-gateway.mjs`
- `apps/api-gateway/src/plugin-routes.mjs`
- `apps/api-gateway/src/plugin-aware-app.mjs`
- `apps/api-gateway/src/server-plugins.mjs`

Tests:

- `apps/api-gateway/test/plugin-gateway.test.mjs`
- `apps/api-gateway/test/plugin-routes-isolated.test.mjs`
- `apps/api-gateway/test/plugin-aware-app.test.mjs`
- `apps/api-gateway/test/server-plugins.test.mjs`

## Safe validation commands

Run from the repository root:

```bash
cd apps/api-gateway
node scripts/link-local-dependencies.mjs
npm run check:plugins
npm test
```

## Parallel dev server

This preserves the default `npm start` entrypoint.

Run only for preview/testing:

```bash
cd apps/api-gateway
npm run start:plugins
```

## Health variables

The gateway attempts `GET /health` against the first configured base URL for each macroplugin. If no base URL is configured, it returns a safe `gateway_online` status.

Infra:

- `ADA_MCP_BASE_URL`
- `MCP_BASE_URL`

Juri:

- `ADA_PETERLE_OPS_BASE_URL`
- `PETERLE_OPS_BASE_URL`
- `ADA_JURI_BASE_URL`

Comunicacao:

- `ADA_COMUNICACAO_BASE_URL`
- `ADA_ZUNI_BASE_URL`
- `ZUNI_BASE_URL`
- `ADA_UNICO_BASE_URL`

Media:

- `ADA_MEDIA_BASE_URL`
- `ADA_REELS_BASE_URL`
- `REELS_BASE_URL`
- `ADA_MCP_BASE_URL`
- `MCP_BASE_URL`

## Expected initial routes

Health:

{plugin} is one of: `infra`, `juri`, `comunicacao`, `media`.

```
GET /v1/plugins/{plugin}/health
GET /v1/plugins/{plugin}/capabilities
POST /v1/plugins/{plugin}/call
```

## Example call

Run against the parallel server only:


```bash
curl -sS http://127.0.0.1:3000/v1/plugins/infra/health; echo
curl -sS http://127.0.0.1:3000/v1/plugins/juri/capabilities; echo
curl -sS -X POST http://127.0.0.1:3000/v1/plugins/media/call \
  -h "content-type: application/json" \
  -d '{"operation":"reels.package.status","dry_run":true,"payload":{}}'; echo
```

## ChatGPT Action connection policy

Do not connect the draft OpenAPIs directly to a production GPT until:

1. `ChatGPT Plugins CI` passes.
3. The parallel gateway is verified in a preview/staging environment.
4. Backend health variables are confirmed as non-secret base URLs.
5. Explicit human approval is recorded for merge and deploy.

## Blocked until dedicated adapters

All write/send/publish/deploy style operations remain blocked by design in the initial macroplugin draft.
