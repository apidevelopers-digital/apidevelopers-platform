# Synthetic Face Pipeline v0 — Scaffold Contract

Status: **scaffold only / no real inference authorized**

This document defines the code boundary for the next Controlled Pilot v0 gate:

`synthetic_face_pipeline` — 20 points.

The scaffold does **not** authorize the gate, does not award points, and does not change the current Controlled Pilot v0 score. Real YuNet/AuraFace execution remains a separate action requiring explicit approval.

## Intended pipeline

`synthetic/licensed-synthetic image -> YuNet -> 5 landmarks -> alignment 112x112 -> pinned AuraFace preprocessing -> AuraFace 512D -> sanitized receipt`

## Current scaffold

`src/synthetic-face-pipeline-v0.mjs` contains orchestration only. Runtime-specific implementations are injected as adapters:

- `detectYuNet5Landmarks`
- `alignFace112x112`
- `inferAuraFace512d`

The scaffold itself:

- loads no model;
- downloads no asset;
- processes no human image;
- performs no thresholding or score comparison;
- returns no embedding;
- persists/logs no embedding;
- makes no identity or match claim;
- mutates no calibration;
- authorizes neither Controlled Pilot nor production.

The allowed input classes for this scaffold are deliberately restricted to:

- `synthetic`
- `licensed_synthetic`

Both require:

- `humanFaceInputUsed=false`
- `biometricInputUsed=false`

Any future path involving a real human face must be governed by a separate consented gate and must not be enabled by this scaffold.

## Pinned interface invariants

The injected runtime must satisfy:

1. YuNet adapter returns exactly 5 finite landmarks.
2. Alignment adapter returns a 112×112 face.
3. AuraFace adapter receives the pinned preprocessing contract:
   - width/height: 112×112
   - scale: `1/127.5`
   - mean: `[127.5, 127.5, 127.5]`
   - swapRB=true
   - dtype: `float32`
   - output dimensions: `512`
   - downstream L2 normalization required
4. AuraFace adapter returns exactly 512 finite values.
5. The orchestration consumes only shape/finite evidence and emits a sanitized receipt.

## Test boundary

`test/synthetic-face-pipeline-v0.test.mjs` uses stub adapters only. It does not invoke YuNet, OpenCV DNN, AuraFace, ONNX, network downloads, biometric fixtures, or human imagery.

The test verifies:

- ordered detector -> alignment -> embedder orchestration;
- 5-landmark fail-closed validation;
- 112×112 alignment contract;
- pinned AuraFace preprocessing metadata;
- 512D fail-closed validation;
- absence of embedding in the receipt;
- no threshold/match/identity/production authorization.

## Gate status

This scaffold is preparatory evidence only.

`synthetic_face_pipeline`: **PENDING**

The gate remains blocked until an explicitly approved runtime execution produces evidence on an approved synthetic/licensed-synthetic fixture and that evidence is reviewed.
