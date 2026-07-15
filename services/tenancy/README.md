# AP Tenancy

Status: Foundation v1
Owner: API Developers.digital
Maturity: L1 -> L2

## Mission

Provide global, neutral and secure multi-tenant primitives for organizations, tenants, workspaces, environments and regions.

## Responsibilities

- represent organizations, tenants, workspaces and environments;
- enforce tenant isolation across platform data;
- define ownership of connections and provider accounts;
- support regional and environment separation;
- emit tenancy lifecycle events;
- integrate with AP Identity, AP Auth, AP Events and AP Audit.

## Out of scope

- user authentication;
- product-specific business rules;
- provider secret storage;
- billing implementation;
- resource-specific permission decisions.

## Canonical entities

- Organization
- Tenant
- Workspace
- Environment
- Region
- Membership
- ConnectionOwnership
- TenantContext

## Completion criteria

- architecture documented;
- contracts versioned;
- executable package created;
- tenant context validation tested;
- cross-tenant access blocked;
- connection ownership tested;
- audit and event hooks defined.
