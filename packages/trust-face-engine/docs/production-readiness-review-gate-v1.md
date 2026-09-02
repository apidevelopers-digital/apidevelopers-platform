# Trust Face Production Readiness Review Gate v1

Status: governance metadata-only; fail-closed.

This gate mirrors the eight production gaps already declared in `packages/trust-face-engine/README.md`: production image-to-embedding inference, face detector, landmark/alignment, real liveness/PAD, template vault/KMS and cryptographic controls, real-store revocation/physical erasure, production SDK, and FAR/FMR + FRR/FNMR + PAD benchmark evidence.

## Evidence classification hardening

Every supplied evidence record must now explicitly carry:

- `evidenceEnvironment="production"`;
- `assessmentScope="external-independent"`;
- `independentAssessmentDeclared=true`;
- `status="pass"`.

Lab, simulation or internally scoped evidence cannot make the review package eligible.

Even when all eight records satisfy those metadata requirements, the result is only `reviewEligible=true`. This gate does not authenticate artifacts, does not verify assessor identity, does not integrate an external evidence verifier and does not prove that the declared independent assessment actually occurred.

Therefore `evidenceAuthenticityVerified=false`, `externalEvidenceVerifierIntegrated=false`, `independentValidationVerified=false`, `productionReady=false` and `biometricClaimReady=false` remain mandatory.

No biometric payload, image/video, embedding, template, ciphertext, key/KMS material, signature, secret, token or password is accepted. The gate exposes no deploy, publish, signing, decryption, vault-write or template-deletion capability.
