# Trust Face canonical backprop v1 — evidence boundary

## Status

**Synthetic differentiable training-graph evidence only. Not a trained biometric backbone.**

This step extends the canonical Trust Face graph with deterministic gradient propagation across all eight residual blocks, a 512D L2-normalized embedding projection and the additive angular-margin objective.

## Confirmed by this change

- the canonical widths remain `64/96/160/256`;
- the canonical depths remain `1/2/3/2`;
- exactly eight residual blocks participate in backpropagation;
- every residual block receives a finite non-zero gradient on the deterministic synthetic fixture;
- every residual block is updated by training;
- the 512D embedding remains L2-normalized;
- the additive angular-margin target logit participates in the gradient path;
- checkpoint state is deterministically digestible;
- only synthetic 112x112 RGB fixtures are used.

## Explicit limits

- `canonicalGraphBackpropReady=true`;
- `spatialConvolutionBackpropReady=false`;
- `biometricBackboneReady=false`;
- `productionReady=false`;
- `biometricClaimReady=false`;
- `realBiometricTrainingAuthorized=false`;
- this is a channel-space residual training graph after a fixed deterministic feature extractor, not full spatial convolution backpropagation from raw pixels;
- no real face image, template or embedding is used;
- no new FMR/FNMR evidence is produced;
- this change alone does not justify claiming a production biometric backbone.

## Next technical gate

Replace the fixed feature extractor / channel-space residual lab with spatial convolution/depthwise operators that preserve the same 8-block canonical topology, and prove gradients from angular-margin loss back to trainable pixel-level stem parameters using deterministic synthetic fixtures first.
