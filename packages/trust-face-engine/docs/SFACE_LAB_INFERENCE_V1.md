# SFace Lab Inference v1

Status: laboratory-only. Not production-ready and not a biometric validation claim.

## Dimension correction

The OpenCV Zoo `face_recognition_sface_2021dec.onnx` candidate is treated as a **128D** embedding model for laboratory execution.

This corrects the earlier 512D assumption in the draft implementation. The Trust Face product target remains **512D**. The external-backbone admission contract therefore now separates:

- **lab admission:** 128D or 512D can be executed when source integrity is verified;
- **product-use dimension requirement:** 512D remains mandatory;
- **production authorization:** always false in this contract.

Until the exact pinned ONNX is executed locally, `embeddingDimArtifactVerified=false`. The runtime itself fails closed unless the model returns exactly 128 values, so the first real execution will provide direct artifact evidence.

## Purpose

Provide an executable bridge from an externally trained, integrity-pinned SFace backbone to the Trust Face laboratory cosine pipeline without storing model weights, face images, aligned crops, or embeddings in GitHub.

Flow:

local image
→ bbox + 5 landmarks
→ OpenCV `FaceRecognizerSF.alignCrop`
→ pinned SFace ONNX
→ expected 128D feature
→ L2 normalization
→ Trust Face embedding/cosine path

## Pinned external source

- Repository: `opencv/opencv_zoo`
- Revision: `47534e27c9851bb1128ccc0102f1145e27f23f98`
- Path: `models/face_recognition_sface/face_recognition_sface_2021dec.onnx`
- Model family: SFace / MobileFaceNet
- Format: ONNX
- Expected size: `38,696,353` bytes
- Expected SHA-256: `0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79`
- Directory license evidence: Apache-2.0 at the same pinned revision.
- Expected lab embedding dimension: `128`
- Trust Face product embedding requirement: `512`

The SHA-256 above is the Git LFS object OID published by the pinned OpenCV Zoo revision. Runtime execution independently hashes the local file and fails closed unless both digest and byte size match.

## Deliberate restrictions

- no automatic model download;
- no model binary committed to this repository;
- no image, crop, or embedding logging;
- no production authorization;
- no biometric claim;
- training-data provenance remains `unknown`;
- commercial use remains unclarified for the API Developers.digital product;
- authentication use remains unclarified;
- independent biometric validation remains `none`;
- a 128D SFace receipt has `productEmbeddingDimCompatible=false`;
- therefore `productUseEligible=false`.

## Runtime boundary

`src/sface-lab-inference-v1.mjs` owns artifact verification, admission, fail-closed execution, and result normalization.

`src/sface-lab-runtime-v1.py` is a narrow OpenCV adapter. It expects a 14-value face vector:

`x, y, w, h, right-eye-x, right-eye-y, left-eye-x, left-eye-y, nose-x, nose-y, mouth-right-x, mouth-right-y, mouth-left-x, mouth-left-y`

A 15-value YuNet result is accepted by the Node boundary and the detector confidence value is removed before alignment.

The Python runtime returns JSON only to stdout. It does not write the aligned crop or embedding to disk.

## What this proves

Once executed with the exact pinned model, a real image, and valid five-point landmarks, this path proves real trained SFace image-to-embedding inference and allows honest 128D cosine experiments.

It does **not** satisfy the 512D product-backbone requirement and does not prove identity, production readiness, FAR/FMR, FRR/FNMR, PAD/liveness performance, demographic robustness, or legal suitability for production authentication.
