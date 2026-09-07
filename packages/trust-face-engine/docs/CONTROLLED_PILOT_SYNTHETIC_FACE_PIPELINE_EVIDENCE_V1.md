# Trust Face — Controlled Pilot Synthetic Face Pipeline Evidence v1

**Date:** 2026-09-06
**Gate:** `synthetic_face_pipeline`
**Scope:** synthetic/licensed input only; no threshold, no identity claim, no production

## Execution

- Workflow: `Trust Face Controlled Pilot Synthetic Face Pipeline Once`
- Run: `34052712786`
- Job: `101539067753`
- Head SHA: `0f790c7531abf70cabd1484c239b648a614c916b`
- Runner: `apidevelopers-mac-ci-03`
- Runner group: `organization-macos-ci`
- Labels: `self-hosted`, `macOS`, `X64`
- Conclusion: `SUCCESS`

## Synthetic fixture

Sanitized GitHub Actions annotation:
- source: `Wikimedia-Commons`
- `publicDomain=true`
- `aiGenerated=true`
- bytes: `464641`
- SHA-1: `c958568ff4ade1e3144be3cc1d6bcfcba0f73200`

The fixture was not committed to GitHub.

## Pipeline evidence

GitHub Actions annotation confirms:
- `gate=synthetic_face_pipeline`
- `executionCompleted=true`
- `detectedFaceCount=1`
- `landmarkCount=5`
- `alignment=112x112`
- `aurafaceOutputDim=512`
- `benchmarkExecuted=false`
- `thresholdApplied=false`
- `identityClaimed=false`
- `productionAuthorized=false`

Runtime annotation:
- Python `3.11`
- OpenCV `4.13.0`
- NumPy `2.2.6`
- temporary source build: true
- global install: false

AuraFace source annotation:
- verified runner cache: true
- ephemeral download: false

## Cleanup / privacy

GitHub Actions cleanup annotation confirms:
- `syntheticFixtureRetained=false`
- `alignedCropRetained=false`
- `embeddingRetained=false`
- `temporaryModelsRemoved=true`
- `temporaryRuntimeRemoved=true`

No raw landmarks, crop, embedding vector, cosine, threshold decision, identity output or production claim is stored in this evidence.

## Interpretation

**Confirmed:** the controlled-pilot synthetic pipeline executed end-to-end on one AI-generated public-domain face fixture through YuNet detection, five landmarks, 112×112 alignment and AuraFace 512D output.

**Confirmed:** the gate remained non-authoritative and non-production.

**Not claimed:** FAR/FMR/FRR/FNMR, calibrated biometric threshold, identity accuracy, liveness/PAD assurance, or production readiness.

This closes the `synthetic_face_pipeline` gate for the Controlled Pilot v0 readiness metric.
