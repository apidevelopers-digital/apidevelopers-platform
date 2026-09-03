# External Trained Backbone Admission v1

Status: lab-only; non-production.

This contract admits metadata for an externally trained face-recognition backbone without storing model weights or biometric payloads.

## Required evidence

- exact model id/family and ONNX artifact format;
- source repository, path and pinned revision;
- SHA-256 digest of the exact model weights;
- SPDX license from the lab allowlist plus a license-evidence reference;
- training-data provenance status;
- explicit commercial-use and authentication-use clarification flags;
- independent-validation status and optional evaluation digest;
- 512-dimensional embedding contract and 5-landmark alignment contract;
- explicit source-integrity verification.

## Admission semantics

`labInferenceEligible=true` only means the exact external artifact was integrity-pinned and may be exercised in laboratory evaluation.

`productUseEligible=true` requires documented training-data provenance, explicit commercial-use clarification, explicit authentication-use clarification, verified independent validation and an evaluation digest.

Even when `productUseEligible=true`, this receipt never sets production authorization or biometric claims. Production promotion remains a separate governed review.

For the current SFace candidate, the directory in OpenCV Zoo declares Apache-2.0, but commercial/authentication use and training-data provenance are not treated as resolved by this contract. Those fields remain false/unknown until supported by direct evidence.

No image, video, embedding, template, model binary, private key, KMS material or secret is stored by this receipt.
