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
- consented score provenance chain from authorization/checkpoint/source/receipt/evidence into the evaluator;
- liveness/PAD lab derived-signal evaluation and tamper-evident evidence contract, without raw image/video/embedding payloads;
- explicit `livenessPad: false`, `realMetricsReady: false` and `productionReady: false` at the production-facing boundary.

Not implemented yet:

- independently validated image-to-embedding production inference;
- independently validated production face detector;
- independently validated production landmark/alignment model;
- real image/video liveness/PAD inference and attack presentation detection;
- enrollment persistence;
- production SDK;
- FAR/FMR, FRR/FNMR or PAD benchmark evidence.

The liveness/PAD lab contract is not evidence of real presentation-attack detection performance and must not be represented as such.

This package must not be represented as a production-ready biometric engine until those gaps are closed and independently evaluated.
