# Hostinger Node build executor preflight

This preflight records the exact source archive selected for a future Node.js build while keeping every external write disabled.

## Pinned source

- repository: `apidevelopers-digital/apidevelopers-platform`
- SHA: `163ea5ccae5be6ecbb190100b99ee3425f0dc14d`
- archive workflow run: `30738206135`
- artifact: `site-factory-hostinger-node-archive-163ea5ccae5be6ecbb190100b99ee3425f0dc14d`
- ZIP: `site-factory-hostinger-node-source-163ea5ccae5be6ecbb190100b99ee3425f0dc14d.zip`
- target: `preview-apidevelopers.apidevelopers.digital`

## Official contract snapshot

Snapshot observed on `2026-08-02`:

- repository: `hostinger/api`
- file: `openapi.json`
- OpenAPI version: `3.0.0`
- API version: `1.23.0`
- endpoint: `POST /api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds/from-archive`
- operation: `hosting_createNodeJSBuildFromArchiveV1`
- request media type: `application/json`
- request schema: `Hosting.V1.NodeJs.CreateFromArchiveRequest`
- required `archive` field type: `string`
- `archive` format: not declared
- documented maximum archive size: 50 MB

This snapshot verifies what the official specification currently declares. It does **not** verify that the declared transport is executable against the live server.

## Server contract conflict

The official issue `hostinger/api#56` records the current conflict:

- documented JSON string request: reported `422`, archive must be a file;
- JSON base64 request: reported `422`, archive must be a file and remain under 51,200 characters;
- multipart file request: reported `403` Cloudflare managed challenge before reaching the API;
- independently verified successful request: none.

The preflight therefore uses `blockReason=official_contract_server_validation_conflict`.

## Fail-closed state

The generated preflight always keeps:

- `status=blocked`
- `mode=dry-run`
- `readyForApply=false`
- `requestPrepared=false`
- `lockClaimEnabled=false`
- `hostingerPostEnabled=false`
- `buildPollingEnabled=false`
- `deployEnabled=false`
- `dnsEnabled=false`
- `hostingerTokenUsed=false`

The workflow requires no Hostinger secret and performs no network request to Hostinger.

## Release guard

The executor cannot be released by a manual flag or runtime override.

A real executor requires all of the following:

1. the official OpenAPI contract changes or a safe transport is independently verified;
2. the upstream issue is resolved or successful independent evidence is recorded;
3. a new executor pull request is reviewed;
4. CI and security checks are green;
5. a fresh single-use approval is bound to the exact SHA, archive and contract snapshot.
