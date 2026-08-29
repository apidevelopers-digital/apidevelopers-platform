# Trust Face Residual Backprop Lab v1 — 2026-08-29

## Status

**Synthetic shape-faithful training laboratory. Not a biometric backbone claim.**

This step extends the owned Trust Face training path from the earlier 8x8 convolution smoke test to the product input/output geometry:

`112x112 RGB -> trainable stem -> depthwise residual block -> global pooling -> 512D projection -> L2 normalization -> classification head`

The laboratory uses deterministic synthetic patterns only.

Current explicit limits:

- `productionReady=false`
- `biometricClaimReady=false`
- `biometricBackboneReady=false`
- `canonicalFourStageBackboneReady=false`
- `realBiometricTrainingAuthorized=false`
- no real face image or embedding is used for training
- no raw checkpoint weights are stored in GitHub evidence

## What is proved

The laboratory propagates gradients through:

- trainable RGB stem weights;
- depthwise 3x3 convolution;
- pointwise channel mixing;
- residual skip path;
- global average pooling;
- 512-dimensional projection;
- L2-normalized embedding path;
- classification head.

A deterministic SHA-256 checkpoint digest binds the smoke-training result without publishing raw weights.

## What is not proved

This does not yet implement the complete four-stage architecture fixed by `trust-face-mobile-residual/v1` with widths `64, 96, 160, 256` and depths `1, 2, 3, 2`.

The fixed 112->14 average downsample and narrow 4-channel laboratory stem exist only to make explicit backpropagation auditable in the current pure-JavaScript CI path.

Therefore this change does **not** justify increasing the biometric product-readiness percentage and does not establish any real-world FMR/FNMR improvement.

## Promotion gate

The next training gate is to execute backpropagation across the complete four-stage residual graph, including the angular-margin identity objective, then serialize a versioned model artifact bound to a permitted dataset manifest and exact training commit.

Only after a permitted face dataset is trained with subject-disjoint validation/test partitions may this new representation be compared against the existing consented-lab baseline.
