# AP Auth

Status: Foundation v1
Owner: API Developers.digital
Maturity: L1 -> L2

## Mission

Provide global, neutral and multi-tenant authentication and authorization primitives for users, service accounts, API keys and external clients.

## Responsibilities

- validate credentials and sessions;
- represent authenticated principals;
- issue and rotate API keys;
- validate scopes, roles and permissions;
- support service accounts;
- integrate with OAuth providers through adapters;
- emit auth lifecycle events;
- generate audit evidence for sensitive operations.

## Out of scope

- identity profile management;
- tenant membership ownership;
- product-specific roles;
- secret storage;
- business-rule decisions.

## Canonical principals

- UserPrincipal
- ServiceAccountPrincipal
- ApiKeyPrincipal
- SessionPrincipal
- ExternalPrincipal

## Initial contracts

- AuthenticatedPrincipal
- AuthContext
- AuthorizationDecision
- ApiKeyReference
- ServiceAccountReference
- SessionReference
- CredentialRevocation

## Completion criteria

- architecture documented;
- contracts versioned;
- executable package created;
- API key lifecycle tested;
- service account lifecycle tested;
- scope and permission decisions tested;
- cross-tenant access blocked;
- audit and event hooks defined.
