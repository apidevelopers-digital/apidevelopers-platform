# Hostinger Node Build upstream blocker — API Gateway

Status: blocked upstream  
Date: 2026-08-16  
Target: `gateway.apidevelopers.digital`

## Confirmed evidence

The API Gateway production target is a classic Hostinger Business Web Hosting website:

- username: `u242521810`
- domain: `gateway.apidevelopers.digital`
- regular Hosting NodeJS endpoint:
  `POST /api/hosting/v1/accounts/u242521810/websites/gateway.apidevelopers.digital/nodejs/builds/from-archive`

Read operations against the same Hosting account work.

A small multipart contract probe previously reached Hostinger and created build
`01a004dc-2636-71a3-a637-fe2be0261d18`.

Current production-equivalent multipart attempts do not reach the Hostinger API.
The edge response is:

- HTTP: `403`
- server: `cloudflare`
- `cf-mitigated: challenge`
- `cf-ray: a2bd605c6ae72ce9-GRU`
- content type: `text/html`
- body title: `Just a moment...`

The blocked response was captured through the operator using sanitized diagnostics;
no credential value is recorded here.

## Upstream match

Hostinger public issue `hostinger/api#56` documents the same contradictory contract:

- documented JSON request reaches the API but is rejected because `archive` must be a file;
- multipart sends the file correctly but is blocked by a Cloudflare managed challenge;
- the issue remains upstream of the API client.

Reference:
`https://github.com/hostinger/api/issues/56`

## Operational consequence

Do not treat repeated multipart retries, filename changes, package-manager changes,
or archive rewrites as a production fix. Those variants were already tested and the
current blocker is at the Cloudflare edge before application validation.

The production workflow is fail-closed for `apply` unless:

`HOSTINGER_NODE_BUILD_MULTIPART_READY=true`

That repository variable must only be enabled after both conditions are satisfied:

1. the upstream Hostinger issue is resolved or Hostinger support confirms the path is allowed; and
2. a fresh production-equivalent probe from the institutional execution path returns a real Hostinger API response and can create a Node build.

Preflight mode remains available because it does not perform the production write.

## Trust state

This blocker does not authorize Trust activation.

Until a current Gateway runtime is actually built, deployed, and validated:

- Global Trust Evaluation remains disabled;
- Global Trust Evaluation Portal remains disabled;
- financial egress remains disabled;
- no real-money path is enabled.

## Resume sequence

After upstream clearance:

1. reanchor `apidevelopers-platform/main`;
2. republish the Gateway runtime from the exact current main SHA;
3. verify ZIP bytes and SHA-256;
4. perform a production-equivalent Hostinger Node build probe;
5. set `HOSTINGER_NODE_BUILD_MULTIPART_READY=true` only with direct evidence;
6. request fresh explicit approval for production deploy;
7. deploy and validate the Gateway;
8. request separate explicit approval before activating Trust flags.
