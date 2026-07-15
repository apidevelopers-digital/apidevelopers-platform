# AP Identity

Status: Foundation v1
Owner: API Developers.digital
Maturity: L1 → L2

## Mission

Provide neutral, global and multi-tenant identity primitives for users, service accounts and external identities.

## Responsibilities

- create and reference identities;
- represent users and service accounts;
- support external identity providers through adapters;
- issue stable identity references for other platform domains;
- preserve tenant isolation;
- emit identity lifecycle events;
- integrate with AP Auth, AP Tenancy, AP Events and AP Audit.

## Out of scope

- authentication protocol implementation;
- authorization and permission decisions;
- tenant membership rules;
- product-specific profiles;
- provider-specific tokens in domain objects.

## Canonical entities

- `Identity`
- `UserIdentity`
- `ServiceAccountIdentity`
- `ExternalIdentity`
- `IdentityStatus`
- `IdentityReference`

## Initial lifecycle

1. `pending`
2. `active`
3. `suspended`
4. `revoked`

## Initial events

- `identity.created.v1`
- `identity.activated.v1`
- `identity.suspended.v1`
- `identity.revoked.v1`
- `identity.external-linked.v1`
- `identity.external-unlinked.v1`

## Security rules

1. Every private operation requires a validated `tenant_id`.
2. Identity does not imply tenant access.
3. Secrets and provider tokens are never stored in identity domain objects.
4. Sensitive lifecycle changes require AP Audit.
5. Provider integrations are isolated behind adapters.
6. Cross-tenant identity access is denied by default.

## Observability

Every operation carries:

- `tenant_id`
- `request_id`
- `correlation_id`
- `principal_id`

## Completion criteria

- architecture documented;
- contracts versioned;
- executable package created;
- lifecycle transitions tested;
- tenant isolation tested;
- audit and event hooks defined.
