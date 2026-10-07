# Family Data Core — API Gateway read-only HTTP v1

**Status:** implementation draft / not wired to the live server.

This module defines the private read-only HTTP surface expected by the MCP Brain executor:

- `GET /v1/family/purchases`
- `GET /v1/family/purchases/:purchase_id`
- `GET /v1/family/products/:product_id/stats`
- `GET /v1/family/products/:product_id/price-history`
- `GET /v1/family/context/chef`
- `GET /v1/family/evidence/:evidence_id`

## Security defaults

- Identity and tenant come from the existing gateway authenticator.
- Authorization is deny-by-default and uses the canonical `family:*` scopes.
- Payment and monetary product reads require `family:finance:read`.
- Evidence requires `family:evidence:read` and remains metadata-only.
- Only GET is accepted.
- Unknown query parameters and unsafe resource IDs are rejected.
- The PostgreSQL adapter requires an explicit household scope.
- Evidence metadata is scoped through purchases belonging to that household.
- No API_STORAGE path or evidence `storage_ref` is returned.
- Monetary aggregates remain exact decimal strings; no JavaScript float conversion is used for money.

## Deliberately not wired

This change does **not**:

- wire the module into `server.mjs`;
- configure or open a PostgreSQL connection;
- create a real network endpoint;
- change DNS;
- deploy anything;
- register the endpoint in MCP Brain live;
- access API_STORAGE;
- ingest Bistek or any family dataset;
- add write routes.

## Next gate

The next gate is composition with an approved PostgreSQL connection, explicit tenant-to-household authorization, and a private endpoint. Runtime wiring and deployment remain separate sensitive actions that require explicit approval.
