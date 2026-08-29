# Trust Face CNN Backprop Lab v1 — evidence boundary

## Status

**Real backpropagation plumbing / synthetic laboratory only. Not a trained biometric backbone.**

This step proves that the owned Trust Face training path can propagate gradients through a trainable convolutional kernel instead of only updating class prototypes.

Current limits:

- `productionReady=false`
- `biometricClaimReady=false`
- `biometricBackboneReady=false`
- `realBiometricTrainingAuthorized=false`
- no real face image is used for training
- no raw checkpoint weights are persisted in GitHub evidence

## Implemented laboratory network

`8x8 synthetic grayscale -> trainable 3x3 convolution (2 filters) -> ReLU -> global average pooling -> trainable linear head -> softmax/cross-entropy`

SGD gradients propagate through the classification head, pooled convolution features, ReLU, convolution bias and every 3x3 kernel parameter. This is genuine backpropagation through convolution, not prototype-only updating.

## Boundary

The canonical product contract remains:

`aligned 112x112 RGB -> owned mobile residual CNN -> 512D -> L2 -> cosine 1:1`

The 8x8 lab validates deterministic gradient plumbing and checkpoint hashing before the larger residual backbone trainer exists. No biometric capability percentage should increase from this smoke training alone.

## Promotion gate

Before `biometricBackboneReady=true`, the implementation must execute the canonical 112x112 RGB residual architecture, backpropagate through all backbone stages and the angular-margin head, serialize a versioned model artifact with digest, bind it to a permitted dataset manifest and exact code commit, use subject-disjoint partitions, and prove held-out genuine/impostor separation with FMR/FNMR.

Real biometric training remains separately governed and is not authorized by this laboratory.
