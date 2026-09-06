# Trust Face — Controlled Pilot v0 Readiness Status V1

**Date:** 2026-09-06  
**Mode:** supervised / consented / non-authoritative pilot  
**Production equivalent:** no

## Score

**15 / 100** confirmed.

This score is the new controlled-pilot readiness metric and does not replace or represent production readiness.

## Gates

- [x] `AuraFace 512D runtime` — 15 points
  - run `34043058902`: `SUCCESS`
  - pinned model SHA-256 verified
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
- [ ] `Synthetic face pipeline` — 20 points
- [ ] `Local pilot interface` — 20 points
- [ ] `Consented 1:1 pilot` — 20 points
- [ ] `Privacy + fail-closed` — 10 points
- [ ] `Pilot liveness/PAD boundary` — 5 points
- [ ] `Operator runbook + kill switch` — 10 points

## Safety boundary

Even at `100 / 100` in this metric, the system remains a controlled, supervised pilot only. It does not authorize production, authoritative identity decisions, high-assurance PAD, financial actions, merge, deploy or release.

## Next gate

The next technical gate is `synthetic_face_pipeline` (20 points): execute licensed/synthetic face detection + 5-landmark alignment + AuraFace 512D end-to-end, without recalibrating any biometric threshold and without production claims.
