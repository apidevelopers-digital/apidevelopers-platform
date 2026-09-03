# SFace Lab Inference v1

Status: laboratory-only. Not production-ready and not a biometric validation claim.

## Purpose

Provide the first executable bridge from an externally trained, integrity-pinned face backbone to the Trust Face 1:1 embedding pipeline without storing model weights or biometric images in GitHub.

Flow:

local image
→ bbox + 5 landmarks
→ OpenCV `FaceRecognizerSF.alignCrop`
→ pinned SFace ONNX
→ 512D feature
→ L2 normalization
→ existing Trust Face embedding/cosine pipeline

## Pinned external source

- Repository: `opencv/opencv_zoo`
- Revision: `47534e27c9851bb1128ccc0102f1145e27f23f98`
- Path: `models/face_recognition_sface/face_recognition_sface_2021dec.onnx`
- Model family: SFace / MobileFaceNet
- Format: ONNX
- Expected size: `38,696,353` bytes
- Expected SHA-256: `0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79`
- Directory license evidence: Apache-2.0 at the same pinned revision.

The SHA-256 above is the Git LFS object OID published by the pinned OpenCV Zoo revision. Runtime execution independently hashes the local file and fails closed unless both the digest and byte size match.

## Deliberate restrictions

- no automatic model download;
- no model binary committed to this repository;
- no image or embedding logging;
- no production authorization;
- no biometric claim;
- training-data provenance remains `unknown`;
- commercial use remains unclarified for the API Developers.digital product;
- authentication use remains unclarified;
- independent biometric validation remains `none`.

Therefore `productUseEligible` remains false even after local source integrity is verified.

## Runtime boundary

`src/sface-lab-inference-v1.mjs` owns artifact verification, admission and result normalization.

`src/sface-lab-runtime-v1.py` is a narrow OpenCV adapter. It expects a 14-value face vector:

`x, y, w, h, right-eye-x, right-eye-y, left-eye-x, left-eye-y, nose-x, nose-y, mouth-right-x, mouth-right-y, mouth-left-x, mouth-left-y`

A 15-value YuNet result is accepted by the Node boundary and its detector confidence is removed before alignment.

The Python runtime returns JSON to stdout. It does not write the aligned crop or embedding to disk.

## What this proves

When executed with the exact pinned model, a real image and valid 5-point landmarks, this path proves real trained SFace image-to-embedding inference.

It still does **not** prove identity, production readiness, FAR/FMR, FRR/FNMR, PAD/liveness performance, demographic robustness, or legal suitability for production authentication.
