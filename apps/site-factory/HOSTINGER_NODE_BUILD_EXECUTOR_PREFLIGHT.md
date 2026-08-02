# Hostinger Node build executor preflight

This preflight records the exact source archive selected for a future Node.js build while keeping every external write disabled.

## Pinned source

- repository: `apidevelopers-digital/apidevelopers-platform`
- SHA: `163ea5ccae5be6ecbb190100b99ee3425f0dc14d`
- archive workflow run: `30738206135`
- artifact: `site-factory-hostinger-node-archive-163ea5ccae5be6ecbb190100b99ee3425f0dc14d`
- ZIP: `site-factory-hostinger-node-source-163ea5ccae5be6ecbb190100b99ee3425f0dc14d.zip`
- target: `preview-apidevelopers.apidevelopers.digital`

## Official endpoint

The intended endpoint is:

`POST /api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds/from-archive`

The upstream transport contract for the `archive` field is not considered verified. The official Hostinger API repository tracks the current inconsistency in issue `hostinger/api#56`.

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

## Unblocking

A real executor requires all of the following:

1. the official archive transport contract is resolved or independently verified;
2. a new executor pull request is reviewed;
3. CI and security checks are green;
4. a fresh single-use approval is issued for the exact SHA and archive.
