# Trust Face External Detector + 5-Landmark Provider Boundary v1

Status: candidate external-provider boundary; non-production.

This contract provides a narrow bridge from an opaque `sampleRef` to an externally supplied face detector and five-landmark provider.

Admission requires provider identity/version metadata, provider code commit, detector model digest, landmark model digest, evaluation digest, exactly five landmarks, and the existing consented-real evaluation authorization bound to protocol digest and provider code commit.

The boundary accepts no raw image/video/pixel/binary/template/embedding/ciphertext/key/KMS/secret/token/password payload. Provider configuration is also screened before invocation.

A provider result is accepted only when `facePresent` is boolean, confidence is finite in `[0,1]`, and any face-present result contains a normalized in-frame bounding box plus the five canonical points (`leftEye`, `rightEye`, `nose`, `mouthLeft`, `mouthRight`) inside that box. Face-absent results must contain no geometry.

A successful invocation means only that the injected candidate provider returned geometry satisfying this contract under an active evaluation authorization. It does not verify provider authenticity, model provenance, external independent validation, detector benchmark quality, alignment quality, liveness/PAD, production infrastructure, or production readiness.

The following remain mandatory: `providerAuthenticityVerified=false`, `externalIndependentValidationVerified=false`, `detectorProductionReady=false`, `landmarkProductionReady=false`, `productionReady=false`, and `biometricClaimReady=false`.

No deploy, publish, model-weight loading, training, vault write, private-key operation, or template deletion surface is exposed.
