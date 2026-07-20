# @apidevelopers/portal-projector

Deterministic, read-only core for deriving Portal projections from records fixed to one Git commit.

## Guarantees

- full commit SHA required;
- all sources belong to the same commit;
- deterministic ordering and canonical serialization;
- SHA-256 over logical projection content;
- duplicate IDs and dangling source references fail closed;
- atomic publication through injected staging and activation adapters;
- reconciliation reports stale or divergent projections;
- no write path to Git or commercial domains.

## API

- `buildProjection(input, options)`
- `extractRecords(input)`
- `canonicalSerialize(value)`
- `sha256(value)`
- `reconcile(expected, observed)`
- `publishAtomically(projection, adapters)`
- `createPortalProjector(options)`

The package does not select storage, API transport, authentication, deployment, or release strategy.
