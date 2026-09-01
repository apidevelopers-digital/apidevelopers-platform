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
- governed enrollment manifest persistence using opaque template references + digests, consent/authorization digests and immutable metadata-only records;
- append-only enrollment revocation lifecycle bound to the immutable enrollment manifest digest, with authorized reason codes and no hard-delete/mutation path;
- explicit `livenessPad: false`, `realMetricsReady: false`, `realEnrollmentReady: false` and `productionReady: false` at production-facing boundaries.

Not implemented yet:

- independently validated image-to-embedding production inference;
- independently validated production face detector;
- independently validated production landmark/alignment model;
- real image/video liveness/PAD inference and presentation-attack detection;
- production biometric template vault/KMS storage and cryptographic access controls;
- physical template erasure/deletion enforcement tied to revocation;
- production SDK;
- FAR/FMR, FRR/FNMR or PAD benchmark evidence.

The liveness/PAD lab contract is not evidence of real presentation-attack detection performance and must not be represented as such.

The enrollment manifest persistence contract stores no image, video, raw embedding or template payload. The revocation lifecycle is a separate append-only audit record; it does not delete or mutate the immutable enrollment manifest and does not prove that any external biometric template was physically erased.

This package must not be represented as a production-ready biometric engine until the remaining gaps are closed and independently evaluated.
