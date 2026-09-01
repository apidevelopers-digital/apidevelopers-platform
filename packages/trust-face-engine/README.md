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
- governed revocation authorization gate bound to the exact enrollment manifest, consent ledger digest, original enrollment authorization digest, reason and active time window; the governed facade rejects digest-only revocation requests;
- simulation-only template vault receipt contract bound to the enrollment manifest, with opaque envelope/key references, declared encryption-algorithm metadata, audit digest, immutable receipt digest and repository-compatible persistence; no ciphertext, key material, secret, biometric payload or real encryption is accepted or performed;
- simulation-only template vault revocation access gate that composes vault receipt reads with the governed enrollment lifecycle, denies usable receipt access after revocation, excludes revoked receipts from usable listings and fails closed on orphaned/tampered lifecycle bindings; it does not delete or mutate any receipt/template and is not enforcement against a real vault;
- simulation-only template vault metadata-read authorization contract that requires a full time-bounded authorization object bound to the exact vault receipt digest, enrollment manifest, consent ledger, original enrollment authorization, operation and purpose; the composed facade requires both a non-revoked receipt and this explicit authorization, rejects digest-only access, exposes no broad listing, and does not authorize biometric template/ciphertext/key/KMS/secret/decryption access or any real-vault operation;
- explicit `livenessPad: false`, `realMetricsReady: false`, `realEnrollmentReady: false`, `realVaultReady: false` and `productionReady: false` at production-facing boundaries.
Not implemented yet:
- independently validated image-to-embedding production inference;
- independently validated production face detector;
- independently validated production landmark/alignment model;
- real image/video liveness/PAD inference and presentation-attack detection;
- production biometric template vault/KMS storage, real encryption/key management and cryptographic access controls;
- revocation enforcement against a real template store and physical template erasure/deletion;
- production SDK;
- FAR/FMR, FRR/FNMR or PAD benchmark evidence.
The liveness/PAD lab contract is not evidence of real presentation-attack detection performance and must not be represented as such.
The enrollment manifest persistence contract stores no image, video, raw embedding or template payload. The revocation lifecycle is a separate append-only audit record. Governed revocation now requires a full, time-bounded authorization object bound to the enrollment manifest and consent digest before the lifecycle receives its derived authorization digest.
The template vault receipt is simulation/lab-only metadata. Its `encryptionAlgorithm` field is declarative only, its key/envelope references must be opaque, `encryptionPerformed` remains `false`, and the receipt does not prove that any biometric template was encrypted, stored, revoked or erased.
The template vault revocation gate is also simulation/lab-only. `simulatedRevocationEnforced=true` means only that the governed facade denies metadata receipt use when the enrollment lifecycle is revoked; `realVaultRevocationEnforced=false` remains explicit because there is no real template store, KMS, ciphertext, cryptographic access-control path or physical template deletion.
The template vault access authorization contract is likewise simulation/lab-only and metadata-only. An active enrollment/receipt is not sufficient by itself: `getAuthorizedReceipt` additionally requires a full authorization object with exact receipt/governance bindings, an allowed purpose and an active time window. `digestOnlyAccessAccepted=false`, `broadListingAuthorized=false`, `realVaultAccessAuthorized=false` and `productionReady=false` remain explicit; this contract does not authorize access to any biometric template, ciphertext, key/KMS/secret material, decryption capability or real vault.
None of these contracts deletes or mutates the immutable enrollment manifest, authorizes hard deletion, or proves that any external biometric template was physically erased.
This package must not be represented as a production-ready biometric engine until the remaining gaps are closed and independently evaluated.
