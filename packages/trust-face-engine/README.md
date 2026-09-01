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
- PAD-lab evidence binding inside `verifyFacePair`, with separate lab-only combined verification semantics;
- governed enrollment manifest persistence contract using opaque template references + digests, consent/authorization digests and immutable metadata-only records;
- explicit `livenessPad: false`, `realMetricsReady: false` and `productionReady: false` at the production-facing boundary.

Not implemented yet:

- independently validated image-to-embedding production inference;
- independently validated production face detector;
- independently validated production landmark/alignment model;
- real image/video liveness/PAD inference and attack presentation detection;
- production enrollment persistence backend with revocation lifecycle and encrypted biometric template storage;
- production SDK;
- FAR/FMR, FRR/FNMR or PAD benchmark evidence.

The liveness/PAD lab contract is not evidence of real presentation-attack detection performance and must not be represented as such.

The enrollment manifest persistence contract stores no image, video, raw embedding or template payload. It is not evidence that real biometric enrollment storage is production-ready.

This package must not be represented as a production-ready biometric engine until those gaps are closed and independently evaluated.
