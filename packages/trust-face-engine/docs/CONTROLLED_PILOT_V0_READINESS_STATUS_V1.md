# Trust Face — Controlled Pilot v0 Readiness Status V1

**Date:** 2026-09-07  
**Mode:** supervised / consented / non-authoritative pilot  
**Production equivalent:** no

## Score

**100 / 100 confirmed.**

This score measures only readiness for the explicitly bounded Controlled Pilot v0. It does **not** represent production readiness, biometric certification, authoritative identity verification, high-assurance PAD, release approval, merge approval or deployment approval.

## Gates

- [x] `auraface_512d_runtime` — **15/15**
  - non-biometric runtime smoke confirmed
  - evidence: `AURAFACE_512D_NONBIOMETRIC_RUNTIME_SMOKE_EVIDENCE_V1.json`

- [x] `synthetic_face_pipeline` — **20/20**
  - synthetic/licensed fixture -> YuNet -> 5 landmarks -> 112x112 alignment -> AuraFace 512D
  - evidence: `CONTROLLED_PILOT_SYNTHETIC_FACE_PIPELINE_EVIDENCE_V1.md`

- [x] `local_pilot_interface` — **20/20**
  - successful operator-local consented camera execution on macOS
  - GitHub Actions not used for biometric execution
  - no raw image/crop/embedding persisted or logged
  - no threshold, match, identity or production claim
  - evidence: `CONTROLLED_PILOT_LOCAL_INTERFACE_EVIDENCE_V1.json`

- [x] `consented_1to1_pilot` — **20/20**
  - two separate operator-local consented captures
  - observed comparison: `cosine_similarity`, score `0.93897`
  - no threshold, match decision or identity claim
  - evidence: `CONTROLLED_PILOT_CONSENTED_1TO1_EVIDENCE_V1.json`

- [x] `privacy_fail_closed` — **10/10**
  - raw biometric transport/persistence and embedding logging/exposure forbidden
  - threshold/identity/production claims fail closed

- [x] `pilot_liveness_pad_boundary` — **5/5**
  - boundary-only; no real PAD evaluation executed
  - raw biometric payloads and PAD/liveness decisions rejected
  - `livenessEvaluated=false`, `padEvaluated=false`
  - `highAssurancePadClaimed=false`, `productionAuthorized=false`
  - evidence: `CONTROLLED_PILOT_LIVENESS_PAD_BOUNDARY_EVIDENCE_V1.json`

- [x] `operator_runbook_kill_switch` — **10/10**
  - default `disabled`; `kill` immediate/idempotent
  - local enable requires explicit confirmation and never authorizes production
  - runbook: `CONTROLLED_PILOT_OPERATOR_RUNBOOK_V1.md`

## Safety boundary

`100/100` means only that the Controlled Pilot v0 readiness gates are complete under the current narrow pilot definition.

It does **not** authorize or claim production use, authoritative biometric identity decisions, financial/legal decisions, calibrated FAR/FMR/FRR/FNMR, high-assurance PAD/anti-spoofing, bona fide/presentation-attack classification, origin attestation, active-challenge verification, independent biometric certification, benchmark-qualified liveness, persistent biometric storage, merge, deploy, release or publication.

Any merge or production-facing action requires explicit approval.

## Current next step

The current merge candidate is **PR #420**. It must remain under review/governance until explicitly approved.

PR #408 remains the broader source/review history and must not be merged or closed implicitly. Any move toward production, real PAD, thresholding, identity decisions or broader biometric operation is a separate front requiring new explicit authorization and acceptance criteria.
