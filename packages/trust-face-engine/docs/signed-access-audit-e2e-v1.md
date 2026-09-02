# Trust Face Signed Access Audit E2E v1

Status: simulation/lab-only.

This test composes the existing signed governed vault flow, signed access decision receipt, decision chain and decision-chain checkpoint into one end-to-end laboratory path.

Validated path:
- active enrollment and vault receipt;
- time-bounded access authorization;
- externally produced Ed25519 proof verified against the lab trust registry;
- allow decision receipt;
- first decision-chain checkpoint;
- trusted-key revocation;
- fail-closed deny decision receipt;
- second chain entry;
- linked checkpoint over the two-decision chain.

The test intentionally adds no new public API and does not change package versioning.

Passing this E2E test does not mean real biometric inference, liveness/PAD, production vault access, production key management, external audit anchoring, production audit storage or production readiness exists.
