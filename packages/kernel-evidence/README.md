# @apidevelopers/kernel-evidence

Governed, tenant-scoped and tamper-evident records for the API Developers.digital Platform Kernel.

## Guarantees

- deterministic SHA-256 integrity;
- immutable defensive copies;
- recursive blocking of secret-like fields;
- tenant-scoped reads;
- append-first registry with explicit revocation;
- no provider, network or persistence side effects.

## API

```js
import { createEvidenceRegistry, verifyEvidence } from "@apidevelopers/kernel-evidence";
```

The registry is in-memory by design. Persistence adapters remain outside the Kernel.
