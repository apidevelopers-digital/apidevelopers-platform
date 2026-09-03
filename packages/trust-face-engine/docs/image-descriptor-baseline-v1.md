# Trust Face Image Descriptor Baseline v1

Status: lab-only deterministic image descriptor; non-production.

## Goal

Provide a real pixels-to-embedding execution path for already aligned 112x112 RGB face crops, with no external model download and no new runtime dependency.

Flow:

`aligned 112x112 RGB face -> grayscale normalization -> low-frequency DCT descriptor -> L2-normalized 512D embedding -> existing cosine similarity`

## What this proves

- a real aligned face pixel sample can be transformed into a finite 512D embedding;
- the embedding is deterministic and L2-normalized;
- the result is directly compatible with the existing `createFaceEmbedding` and `cosineSimilarity` contracts;
- the descriptor runs entirely in memory;
- the module stores neither input pixels nor the resulting embedding.

## Security and claim boundaries

This baseline is deliberately not a production biometric model.

It explicitly keeps:

- `trainedBiometricWeightsIncluded=false`;
- `realBiometricModel=false`;
- `independentlyValidated=false`;
- `embeddingStored=false`;
- `productionReady=false`;
- `biometricClaimReady=false`.

It does not prove identity, FAR/FMR, FRR/FNMR, liveness/PAD, detector quality, landmark quality, demographic performance, attack resistance, provider authenticity or production readiness.

The module accepts only an already aligned 112x112 RGB pixel sample. Full image decoding, face detection, landmarks/alignment and PAD remain outside this component.

## Personal-data discipline

No user photo, user pixel array, user embedding or user similarity score is committed by this change. Real-photo smoke tests are executed locally only and are not repository fixtures.

## Next step

Use this baseline to validate the end-to-end plumbing while separately admitting a real face-specific trained checkpoint (for example SFace/ArcFace-class) with immutable provenance, digest verification and independent evaluation evidence. The production readiness gate must remain closed until that evidence exists.
