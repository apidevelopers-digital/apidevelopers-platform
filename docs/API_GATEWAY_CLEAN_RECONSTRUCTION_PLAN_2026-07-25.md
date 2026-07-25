# API Gateway foundation — clean reconstruction plan

Date: 2026-07-25

## Context

PR #15 (`foundation/runner-smoke-20260723`) is not suitable for direct merge into `main`.

Confirmed state observed during reanchoring:

- the PR is a draft;
- the branch contains a large historical tree;
- the comparison exceeds the integration response limit;
- the branch includes multiple applications, packages, services, documentation and operational artifacts;
- `apps/api-gateway` exists in the historical branch but does not exist in the current `main`.

## Objective

Reconstruct the API Gateway incrementally from the current `main`, using small, testable and reviewable pull requests.

Clean branch:

`feat/api-gateway-foundation-clean-20260725`

Base commit:

`e683b26ed613c15650adaa8a03b625ddf5fcf123`

## Historical source inventory

The historical `apps/api-gateway` contains:

- `package.json`;
- source modules for server, application, catalog, security, rate limiting and audit;
- client registry and persistence modules;
- OpenAPI generation;
- portal projector and learning routes;
- automated tests.

The historical package also depends on internal packages that are not yet confirmed in the current `main`.

## Reconstruction sequence

1. Add a dependency-free HTTP health foundation.
2. Add isolated tests using Node.js built-in test runner.
3. Add CI on the institutional runner.
4. Review internal package dependencies before importing them.
5. Introduce authentication, registry, rate limiting and audit in separate pull requests.
6. Introduce OpenAPI and projector routes only after the core contract is stable.

## Governance

- Do not merge PR #15 directly.
- Do not copy the entire historical tree.
- Each increment must have its own evidence and tests.
- Merge requires explicit approval.
- Historical files are references, not automatically authoritative.
