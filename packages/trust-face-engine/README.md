# @apidevelopers/trust-face-engine

Owned biometric verification kernel for the API Developers.digital Trust Face product.

## Current scope — lab v0

Implemented:

- capture quality signal gate;
- normalized embedding contract;
- cosine similarity;
- versioned thresholds;
- 1:1 verification signal;
- explicit separation between biometric signal and governed Trust decision;
- explicit `livenessPad: false` and `productionReady: false`.

Not implemented yet:

- image-to-embedding inference;
- face detector;
- landmark/alignment model;
- liveness/PAD;
- enrollment persistence;
- production SDK;
- FAR/FMR, FRR/FNMR or PAD benchmark evidence.

This package must not be represented as a production-ready biometric engine until those gaps are closed and independently evaluated.
