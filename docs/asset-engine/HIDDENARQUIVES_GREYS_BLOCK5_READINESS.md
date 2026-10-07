# Hidden Arquives / Greys — Block 5 readiness

Status: active checklist  
Scope: ADA Asset Engine v1 / Hidden Arquives Greys  
Production publish: blocked until explicit Igor approval

## Purpose

This checklist groups the larger Block 5 execution path so the front can move in fewer operational passes.

The objective is to take approved Greys source assets from:

```text
media/sources/hiddenarquives/greys/
```

to a complete dry-run evidence package:

```text
artifacts/asset-engine/dry-run/
```

without publishing to Hostinger.

## One-pass command set

Run after the approved source assets are committed:

```bash
node scripts/asset-engine-ingest-greys.mjs --strict
node scripts/asset-engine-dry-run-greys.mjs
node scripts/asset-engine-render-greys.mjs
node scripts/asset-engine-hostinger-plan-greys.mjs
node scripts/asset-engine-hostinger-rollback-plan-greys.mjs
node scripts/asset-engine-http-validation-plan-greys.mjs
node scripts/asset-engine-hostinger-publish-greys.mjs
```

The final command is still a safety gate in this block. It must not execute real SFTP.

## Expected evidence files

| File | Purpose |
|---|---|
| `hiddenarquives-greys-ingest-report.json` | Confirms source assets, missing files, extras, size and SHA1 |
| `hiddenarquives-greys-dry-run-manifest.json` | Versioned manifest with source status and hashes |
| `hiddenarquives-greys-index.html` | Local preview page |
| `diagnostic-report.json` | Dry-run diagnostic report |
| `hostinger-publish-plan.json` | Hostinger path and upload plan |
| `hostinger-rollback-plan.json` | Backup/restore plan for future real publish |
| `hostinger-http-validation-plan.json` | Public HTTP validation plan for after real publish |

## Readiness states

| State | Meaning |
|---|---|
| `waiting_for_approved_assets` | No real approved images are present yet |
| `partial_assets_present` | Some files exist but the set is incomplete or has extras |
| `ready_for_manifest_with_real_hashes` | All expected files exist and strict ingest can pass |
| `ready_for_publish_approval_request` | Manifest, publish plan, rollback plan, HTTP plan and gate report exist |

## Blockers for real publication

Real SFTP publication remains blocked if any item below is true:

- any expected source asset is missing;
- any unexpected file exists in the source directory;
- any asset has zero bytes;
- manifest lacks real SHA1 values;
- Hostinger plan has no real asset uploads;
- rollback plan is missing;
- HTTP validation plan is missing;
- explicit Igor approval phrase is missing.

## Explicit approval phrase

Future real publication requires this exact approval phrase:

```text
Igor aprova publicação real SFTP do ADA Asset Engine para Hidden Arquives Greys.
```

This checklist does not authorize publication by itself.
