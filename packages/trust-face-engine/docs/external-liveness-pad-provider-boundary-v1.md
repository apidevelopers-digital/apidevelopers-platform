# Trust Face External Liveness/PAD Provider Boundary v1

Status: candidate external-provider boundary; non-production.

This contract provides a narrow bridge from an opaque `sampleRef` to an externally supplied liveness / presentation-attack-detection provider.

Admission requires provider identity/version metadata, provider code commit, model digest, evaluation digest, an explicit input modality (`image` or `video`), and the existing consented-real evaluation authorization bound to the exact protocol digest and provider code commit.

The boundary accepts no raw image/video/pixel/frame/binary/template/embedding/ciphertext/key/KMS/secret/token/password payload. Provider configuration is screened before invocation. Inline `data:` / `base64:` sample references are rejected.

A provider result is accepted only when `presentationAttackDetected` is boolean and both `padScore` and `livenessScore` are finite values in `[0,1]`. The result is returned ephemerally and is not stored by this boundary.

A successful invocation means only that the injected candidate provider returned PAD/liveness signal metadata satisfying this contract under an active evaluation authorization. It does not prove provider authenticity, media origin, active challenge execution, liveness/PAD benchmark performance, APCER/BPCER, detector/alignment quality, independent external validation, or production readiness.

The following remain mandatory: `providerAuthenticityVerified=false`, `externalIndependentValidationVerified=false`, `activeChallengeExecutedByBoundary=false`, `originAttestedByBoundary=false`, `realPadReady=false`, `benchmarkReady=false`, `productionReady=false`, and `biometricClaimReady=false`.

No deploy, publish, model-weight loading, training, private-key operation, vault write, media storage, or template deletion surface is exposed.
