# Mitra jurisprudence provider contract — read-only design

**Status:** proposed
**Date:** 2026-09-29
**Repository:** `apidevelopers-digital/apidevelopers-platform`
**Scope:** provider contract design only

## Scope

This document defines the next safe step for evolving `mitra.buscar_jurisprudencia` from a published read-only stub into a controlled read-only provider integration.

This milestone does not enable real external execution. It defines the contract, safety boundaries, expected request shape, expected response shape, and tests required before any jurisprudence source can be connected.

## Current baseline

The following state is already confirmed in `main`:

- `mitra.buscar_jurisprudencia` has a published read-only executable envelope.
- The internal ADA Mitra route exists:
  - `GET /v1/ada/mitra/legal/jurisprudencia`
- The route currently returns:
  - `503 dependency_unavailable`
  - `reason=jurisprudence_source_not_connected`
- The runtime was published from the `main` commit that contains PR `#662`.
- Public saved-token probe run `#18` completed with `success`.

## Provider contract

The approved provider must expose a single read-only method:

```js
await jurisprudenceProvider.search(query, context)
```

### Required query input

| Field | Required | Type | Rule |
|---|---:|---|---|
| `q` | yes | string | trimmed, collapsed whitespace, min 3, max 240 |
| `tribunal` | no | string | max 40 |
| `periodFrom` | no | string | `YYYY-MM-DD` |
| `periodTo` | no | string | `YYYY-MM-DD` |
| `limit` | no | integer | min 1, max 10, default 5 |

### Required context input

| Field | Expected value |
|---|---|
| `adapterId` | `mitra.buscar_jurisprudencia` |
| `access` | `read_only` |
| `rawSqlAllowed` | `false` |
| `writeAllowed` | `false` |
| `identity` | sanitized identity only |

### Required provider output

The provider must return an object with a `results` array.

Each result may include only safe public fields:

| Field | Type |
|---|---|
| `id` | string |
| `title` | string |
| `source` | string |
| `url` | string |
| `court` | string |
| `date` | string |
| `summary` | string |

Extra provider fields must be ignored by the bridge unless separately approved.

## Safety boundaries

The integration must preserve:

- no writes;
- no raw SQL;
- no database connection unless separately approved;
- no secrets in payloads;
- no credentials returned to callers;
- no mutation of external legal systems;
- no Lex/Mitra external execution without separate approval;
- no provider enabled by default.

## Expected runtime behavior before provider approval

Until a provider is approved and injected, the route must continue to return:

```json
{
  "ok": false,
  "error": "dependency_unavailable",
  "reason": "jurisprudence_source_not_connected",
  "executionStatus": "provider_contract_ready",
  "readOnly": true,
  "writeExecuted": false
}
```

## Required tests for the next implementation PR

The next implementation PR should include tests that prove:

1. the provider is disabled by default;
2. invalid `q` is rejected before provider execution;
3. invalid dates are rejected before provider execution;
4. `limit` is capped at 10;
5. injected mock provider receives sanitized query and read-only context;
6. provider output is normalized to safe fields only;
7. writes remain blocked with `405`;
8. insufficient scope remains blocked with `403`;
9. unauthenticated calls remain blocked;
10. no token, cookie, password, private key, or access token appears in responses.

## Explicit non-scope

This contract does not:

- connect a jurisprudence source;
- enable external provider execution in production;
- add credentials;
- add secrets;
- add DNS changes;
- add database access;
- add raw SQL;
- add writes;
- alter public probe workflow;
- alter Hostinger manually.

## Next recommended step

Open a separate implementation PR that adds an injectable read-only provider interface and mock-provider tests while keeping the production/default runtime behavior as `dependency_unavailable`.
