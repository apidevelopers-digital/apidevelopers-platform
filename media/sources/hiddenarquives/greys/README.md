# Hidden Arquives / Greys — approved source assets

This directory is reserved for the **approved real source assets** used by the ADA Asset Engine v1 pilot for Hidden Arquives / Hidden Archives.

## Expected files

The current Greys catalog expects exactly these source files:

| Order | File | Role |
|---:|---|---|
| 1 | `001-hero.png` | hero |
| 2 | `002-council.png` | card |
| 3 | `003-anatomy.png` | card |
| 4 | `004-navigation.png` | card |
| 5 | `005-learning.png` | card |
| 6 | `006-life-cycle.png` | card |
| 7 | `007-society.png` | card |
| 8 | `008-adult.png` | card |
| 9 | `009-nursery.png` | card |
| 10 | `010-encounters.png` | card |

## Safety rules

- Commit only approved visual source files here.
- Do not commit credentials, exports with embedded secrets, `.env` files, or Hostinger access material.
- Do not commit generated dry-run artifacts from `artifacts/asset-engine/dry-run/`.
- Do not publish to Hostinger from this directory without explicit Igor approval.
- Keep file names stable so SHA1-based manifests and publish plans remain auditable.

## Validation commands

Before any publication plan can be considered ready:

```bash
node scripts/asset-engine-ingest-greys.mjs --strict
node scripts/asset-engine-dry-run-greys.mjs
node scripts/asset-engine-render-greys.mjs
node scripts/asset-engine-hostinger-plan-greys.mjs
node scripts/asset-engine-hostinger-publish-greys.mjs
```

The publish script remains a gate in this block. Real SFTP publication is not authorized by this directory alone.
