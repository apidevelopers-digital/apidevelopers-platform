# @apidevelopers/portal-projector

Deterministic, read-only core for deriving Portal projections from records fixed to one Git commit.

## Guarantees

- full commit SHA required;
- all sources belong to the same commit;
- deterministic ordering and canonical serialization;
- SHA-256 over logical projection content;
- duplicate IDs and invalid source references fail closed;
- atomic publication through injected staging and activation adapters;
- reconciliation reports stale or divergent projections;
- no write path to Git or commercial domains.

## Core API

- `buildProjection(input, options)`
- `extractRecords(input)`
- `canonicalSerialize(value)`
- `sha256(value)`
- `reconcile(expected, observed)`
- `publishAtomically(projection, adapters)`
- `createPortalProjector(options)`

## Git reader

Import the commit-pinned read-only adapter through:

```js
import { createGitCommitReader } from "@apidevelopers/portal-projector/git-reader";
```

The reader requires:

- a full 40-character commit SHA;
- a `readBlob({ repository, commit, path })` port;
- a `listTree({ repository, commit, prefix })` port.

It exposes only:

- `readText(path)`
- `readMany(paths)`
- `list(prefix)`
- `repository`
- `commit`
- `mutationAllowed: false`

Every adapter call receives the same immutable repository and commit. Mixed-commit responses, unsafe paths, entries outside the requested prefix and malformed adapter results are rejected.

The package does not select storage, API transport, authentication, deployment, or release strategy.
