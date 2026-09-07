# Mitra Public Research Facade — Runtime v1

**Status:** candidate runtime contract  
**Repository:** `apidevelopers-digital/apidevelopers-platform`  
**Entrypoint:** `apps/api-gateway/src/mitra-public-server.mjs`  
**Public routes:**  
- `GET /v1/mitra/public/health`
- `OPTIONS /v1/mitra/public/search`
- `POST /v1/mitra/public/search`

## Purpose

Expose only the Mitra public legal-research surface to a browser while keeping all upstream credentials and private-office context server-side.

The entrypoint wraps the existing institutional `api-gateway`. Non-Mitra routes are delegated unchanged to the existing gateway app.

## Required runtime configuration

`MITRA_PUBLIC_RESEARCH_UPSTREAM_BASE_URL`

Base HTTPS URL of the reviewed public/read-only legal gateway. Expected upstream route:

`POST {BASE_URL}/search/global`

Request body sent server-side:

```json
{
  "q": "pesquisa",
  "limit": 8
}
```

## Optional runtime configuration

`MITRA_PUBLIC_RESEARCH_UPSTREAM_BEARER`

Optional upstream bearer. It is read only by the server process and must never be exposed as a Vite/browser variable.

`MITRA_PUBLIC_RESEARCH_ALLOWED_ORIGINS`

Comma-separated browser origins. Defaults include:

- `https://preview-apidevelopers.apidevelopers.digital`
- `https://mitra.apidevelopers.digital`
- local Vite development origins

`MITRA_PUBLIC_RESEARCH_TIMEOUT_MS`

Default: `12000`.

`MITRA_PUBLIC_RESEARCH_RATE_LIMIT_MAX`

Default: `30` requests per window.

`MITRA_PUBLIC_RESEARCH_RATE_LIMIT_WINDOW_MS`

Default: `60000`.

## Trust boundary

The browser never forwards or receives:

- Peterle Ops bearer;
- Porta Jurídica bearer;
- DataJud API key;
- private cookies;
- private client identifiers;
- private memory/documents/processes;
- upstream `raw` payloads.

The facade only returns normalized public fields:

- title;
- summary;
- source;
- source URL;
- citation;
- date;
- confidence;
- legal warning;
- queried-at timestamp.

## Reverse-proxy requirement

Rate limiting uses `x-real-ip`, `cf-connecting-ip`, or the first `x-forwarded-for` value.

Before internet exposure, the edge/reverse proxy must overwrite those headers from the trusted connection metadata. Client-supplied forwarding headers must not be trusted unchanged.

## CORS

Browser origins outside the allowlist receive `403 origin_not_allowed`.

The public endpoint does not use browser credentials. The frontend is expected to call with `credentials: omit`.

## Failure behavior

If the upstream is not configured:

`503 upstream_not_configured`

If the upstream times out:

`504 upstream_timeout`

If the upstream is unavailable:

`502 upstream_unavailable`

If the request exceeds the local rate limit:

`429 rate_limited`

No failure path performs a write.

## Deployment boundary

This document and the implementation do not authorize:

- DNS changes;
- production deployment;
- activating the upstream;
- storing a bearer in GitHub source;
- enabling private-office routes;
- database access;
- login activation.

Deployment and secret configuration remain separate approval-gated actions.
