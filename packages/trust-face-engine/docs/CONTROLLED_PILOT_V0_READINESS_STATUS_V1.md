# Trust Face — Controlled Pilot v0 Readiness Status V1

**Date:** 2026-09-06
**Mode:** supervised / consented / non-authoritative pilot
**Production equivalent:** no

## Score

**35 / 100** confirmed.

This score is the controlled-pilot readiness metric and does not replace or represent production readiness.

## Gates

- [x] `AuraFace 512D runtime` — **15/15**
  - run `34043058902`: `SUCCESS`
  - pinned AuraFace model SHA-256 verified
  - non-biometric procedural fixture only
  - input `[1,3,112,112]` float32
  - output `[1,512]` float32
  - output finite and non-zero
  - downstream L2 normalization applied, norm `1.0`
  - OpenCV `4.13.0`, NumPy `2.2.6`
  - no human face input
  - no biometric input
  - no embedding persisted or logged
  - no benchmark, threshold, match, identity claim, calibration or production
  - evidence: `packages/trust-face-engine/docs/AURAFACE_512D_NONBIOMETRIC_RUNTIME_SMOKE_EVIDENCE_V1.json`

- [x] `Synthetic face pipeline` — **20/20**
  - run `34052712786`: `SUCCESS`
  - AI-generated public-domain fixture from Wikimedia Commons
  - fixture integrity pinned by bytes `464641` and SHA-1 `c958568ff4ade1e3144be3cc1d6bcfcba0f73200`
  - YuNet detected exactly one face
  - five landmarks produced
  - 112×112 alignment executed
  - AuraFace output dimension `512`
  - Python `3.11`, OpenCV `4.13.0`, NumPy `2.2.6`
  - synthetic fixture, aligned crop and embedding not retained
  - temporary models/runtime removed
  - no benchmark, threshold, identity claim or production
  - evidence: `packages/trust-face-engine/docs/CONTROLLED_PILOT_SYNTHETIC_FACE_PIPELINE_EVIDENCE_V1.md`

- [ ] `Local pilot interface` — **20 points**
- [ ] `Consented 1:1 pilot` — **20 points**
- [ ] `Privacy + fail-closed` — **10 points**
- [ ] `Pilot liveness/PAD boundary` — **5 points**
- [ ] `Operator runbook + kill switch` — **10 points**

## Safety boundary

Even at `100 / 100` in this metric, the system remains a controlled, supervised pilot only. It does not authorize production, authoritative identity decisions, high-assurance PAD, financial actions, merge, deploy or release.

## Next gate

The next product-facing gate is `local_pilot_interface` (**20 points**): provide an operator-local interface that accepts a consented local image/camera input without routing raw biometric material through GitHub Actions, runs the pinned detection/alignment/AuraFace path locally, and emits only sanitized operational status by default.

Real human-image execution remains a separate sensitive action and requires explicit approval.
