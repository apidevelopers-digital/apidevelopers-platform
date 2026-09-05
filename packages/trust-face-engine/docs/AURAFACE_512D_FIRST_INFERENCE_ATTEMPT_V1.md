# AuraFace 512D — first inference attempt v1

**Date:** 2026-09-05  
**Mode:** laboratory / controlled one-shot  
**Source run:** `33950069289`  
**Source commit:** `2ede890a45c9272bb8202fd34fde74980f70921e`

## Outcome

**Confirmed:** the approved first-inference workflow ended in `FAILURE`.

Public GitHub Actions annotations for the failed `infer` job report:

- failed step: `Execute explicitly approved AuraFace 512D first inference`
- process exit code: `41`
- `authorizedSampleFound=false`
- message: no approved local sample was found in privacy-scoped roots
- observed runner: `apidevelopers-mac-ci-03`
- runner labels remained `macOS / X64`
- canonical institutional runner name remains `igor-mac-runner`

## Control-flow proof

The canonical one-shot script on the working branch executes in this order:

1. `preflight_started`
2. `authorized_sample_discovery_started`
3. search only privacy-scoped local roots for an allowlisted sample
4. if no sample is found, emit `authorizedSampleFound=false` and exit `41`
5. only after a sample exists:
   - `model_integrity_started`
   - runtime preparation
   - `first_inference_started`
   - AuraFace forward
   - sanitized evidence validation

Because the source run exited `41` at the sample-discovery gate:

- `authorizedSampleFound=false`
- sample was not accessed by the inference runner
- model integrity/runtime stages were not reached by this execution path
- `first_inference_started` was not reached
- AuraFace forward was not executed
- no 512D embedding was produced by this attempt
- no cosine was computed
- no threshold was applied
- no match or identity claim was made

## Privacy

Nothing from a biometric sample was persisted to GitHub:

- sample path: not stored
- sample filename: not stored
- sample content digest: not stored
- image: not stored
- crop: not stored
- landmarks/bbox/detector score: not stored
- raw embedding: not stored
- normalized embedding: not stored
- individual cosine/score: not stored

## Safety state

Remain false:

- `inferenceExecuted=false`
- `benchmarkExecuted=false`
- `thresholdApplied=false`
- `matchedClaimed=false`
- `identityClaimed=false`
- `calibrationMutationAllowed=false`
- `productionAuthorized=false`
- `productionReady=false`
- `biometricClaimReady=false`

## Diagnostic attempts

Runner-local and Actions-API diagnostic workflows were used only to diagnose the failed run. They did not access a sample, model, crop or embedding and did not execute inference.

The decisive evidence is the source run's public GitHub Actions annotation plus the canonical control flow of `run-auraface-512d-first-inference-once.sh`.

## Next gate

Place one already-authorized local sample, preserving its allowlisted filename, in the privacy-scoped runner directory:

`$HOME/.cache/apidevelopers-digital/trust-face/authorized-samples/`

Do not upload the sample to GitHub.

A future execution that actually reaches AuraFace inference remains a sensitive operation. It must not be automatically retried from this checkpoint.

The Trust Face laboratory development baseline remains **85% ±5 p.p.**.
