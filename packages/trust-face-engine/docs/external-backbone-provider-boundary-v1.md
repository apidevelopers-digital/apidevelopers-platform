# Trust Face External Backbone Provider Boundary v1

Status: candidate external-provider boundary; non-production.

This contract bridges an already trained checkpoint manifest to an externally supplied embedding provider while accepting only an opaque `sampleRef` inside Trust Face.

Admission requires a trained/evaluated 512-dimensional checkpoint, `trainedBiometricWeightsIncluded=true`, `biometricBackboneReady=true`, exact provider weights/evaluation digest binding, an `inferByRef` provider method, and active consented-real evaluation authorization bound to protocol digest and checkpoint code commit.

Raw image/video/pixel/binary payloads are not accepted here. A successful call means only that the injected provider returned a finite 512-dimensional embedding through the authorized candidate boundary.

It does not verify provider authenticity, model provenance, independent external validation, detector/alignment quality, liveness/PAD, benchmark claims or production infrastructure. `providerAuthenticityVerified=false`, `externalIndependentValidationVerified=false`, `productionReady=false`, and `biometricClaimReady=false` remain mandatory.

No deploy, publish, model-weight loading, private-key storage, vault write or template deletion operation is exposed.
