# ControlFace10K materialization evidence v1

**Date:** 2026-09-04  
**Scope:** Trust Face laboratory external benchmark materialization only

## Source

- dataset: `ControlFace10K`
- provider: `HuMInGameLab`
- candidate type: `synthetic_permissive`
- declared license: `CC-BY-4.0`
- archive: `controlface10k.zip`

## Pinned integrity

- expected bytes: `3137641968`
- expected SHA-256: `d0ed28b3271a75ac5bb8e6799fdfe78ba3a91fb7eddecf19d960ed18fe00a108`

## Execution evidence

- GitHub Actions run: `33913361203`
- workflow: `Trust Face ControlFace10K-Materialize Once`
- head SHA: `6b538aceb176486f6589afe6456d41aed68c99b1`
- run status: `SUCCESS`
- preflight: `passed=true`
- materialization verified: `true`
- verified bytes: `3137641968`
- verified SHA-256: `d0ed28b3271a75ac5bb8e6799fdfe78ba3a91fb7eddecf19d960ed18fe00a108`
- benchmark executed: `false`
- archive extracted by this workflow: `false`
- calibration mutated: `false`

## Runner evidence

- canonical institutional runner reference: igor-mac-runner
- runner name observed in this run: `apidevelopers-mac-ci-01`
- platform gate: `macOS / X64`
- the name drift is recorded as an operational warning and does not change the canonical runner policy

Directory space observed by the preflight:
- available bytes: `239259099136`
- required bytes including safety margin: `4211383792`

## Interpretation

**Confirmed:** the pinned ControlFace10K`archive was materialized on the self-hosted macOS/X64 runner and matched the pinned byte size and SHA-256.

**Not confirmed:** benchmark execution, threshold calibration, FAR/FMR, FRR/FNMR, identity claim, production readiness, or production authorization.

**Safety flags:**
- `benchmarkExecuted=false`
- `thresholdCalibrated=false`
- `calibrationMutationAllowed=false`
- `productionReady=false`
- biometricClaimReady=false`

## Next gate

The next gate is a separately authorized benchmark execution on the frozen deterministic 64-identity × 3-image subset.

This document does not authorize that execution.
