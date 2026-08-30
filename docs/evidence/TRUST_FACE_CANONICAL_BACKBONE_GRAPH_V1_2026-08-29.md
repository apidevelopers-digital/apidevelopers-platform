# Trust Face Canonical Backbone Graph v1 — evidence boundary

## Status

**Canonical training-graph contract only. Not a trained biometric backbone.**

This step binds the owned Trust Face architecture contract to one executable graph description:

`112x112 RGB -> stem -> stages 64/96/160/256 with depths 1/2/3/2 -> 512D -> L2`

The graph expands to exactly eight residual blocks and binds the 512D output contract to the existing additive angular-margin / quality-aware training objective.

## What is confirmed by this change

- canonical widths: `64, 96, 160, 256`;
- canonical depths: `1, 2, 3, 2`;
- eight residual blocks;
- 512-dimensional L2-normalized embedding contract;
- additive angular-margin head executes against the canonical 512D contract;
- quality-aware margin path remains executable;
- no raw biometric material is introduced.

## Explicit limits

- `fullBackpropReady=false`;
- `biometricBackboneReady=false`;
- `productionReady=false`;
- `biometricClaimReady=false`;
- `realBiometricTrainingAuthorized=false`;
- no real face images, templates or embeddings are used;
- this change does **not** establish new FMR/FNMR evidence;
- this change alone does **not** justify increasing biometric readiness.

The next technical gate is actual backpropagation through all eight canonical residual blocks and the angular-margin objective, with deterministic synthetic fixtures first.
