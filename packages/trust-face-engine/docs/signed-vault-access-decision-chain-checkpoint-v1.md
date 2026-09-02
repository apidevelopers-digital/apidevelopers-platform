# Signed Vault Access Decision Chain Checkpoint v1

Status: simulation/lab-only.

This contract creates a deterministic checkpoint over an already verified `signed-vault-access-decision-chain/v1`.

The checkpoint contains only metadata: `checkpointId`, `entryCount`, first/last decision IDs, `headChainDigest`, optional `previousCheckpointDigest`, `checkpointAt` and its own `checkpointDigest`.

It stores no decision-receipt payload, proof payload, signature, public/private key, biometric payload, embedding, ciphertext, KMS material or secret.

`chainIntegrityVerifiedBeforeCheckpoint=true` and `checkpointIntegrityVerifiedInLab=true` mean only that the in-package laboratory chain and checkpoint digests were verified together.

No external audit sink, production audit store, cryptographic timestamp authority or external checkpoint anchor is integrated. `externalAuditSinkIntegrated=false`, `productionAuditStoreIntegrated=false`, `cryptographicTimestampAuthorityIntegrated=false`, `externalCheckpointAnchorIntegrated=false`, `realVaultAccessAuthorized=false`, `realVaultReady=false`, `productionReady=false` and `biometricClaimReady=false` remain explicit.
