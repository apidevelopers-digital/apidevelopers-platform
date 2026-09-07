# ControlFace10K benchmark authorization v1

**Date:** 2026-09-04
**Scope:** Trust Face Engine laboratory benchmark only

benchmarkExecutionApproved: true
calibrationMutationAllowed: false
thresholdCalibrationAllowed: false
identityClaimAllowed: false
productionAllowed: false

Authorized execution:
- dataset: ControlFace10K
- subset: 64 deterministic identities × 3 images = 192 images
- use: benchmark-only against the already frozen SFace experimental band
- source archive must match the already verified pinned size and SHA-256

Explicitly outside authorization:
- recalibrating or mutating the frozen band
- creating a biometric threshold
- claiming identity/match
- production activation
- merge, deploy or release

Only sanitized aggregate benchmark evidence may be persisted to GitHub. Raw images, crops,
embeddings, detector scores, individual cosines, identity paths and person-associated scores
must not be committed.
