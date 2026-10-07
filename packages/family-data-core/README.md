# Family Data Core — Read-only Contract v1

Implementation contract derived from the canonical institutional documents:

- `apidevelopers-institution/docs/FAMILY_DATA_CORE_V1.md`
- `apidevelopers-institution/docs/FAMILY_DATA_CORE_SCHEMA_API_V1.md`

Status: implementation draft. This package MUST NOT enable ingestion or production writes.

## Tool surface

- `family.purchase.list`
- `family.purchase.get`
- `family.product.stats`
- `family.product.price_history`
- `family.context.chef`
- `family.evidence.get` (metadata by default)

Reserved and intentionally not implemented here:

- `family.ingest.apply`
- `family.correction.append`

## Security defaults

- tenant: `homosapiens-id`
- deny by default
- least privilege
- evidence content is not returned by common reads
- non-culinary family domains are excluded from `family.context.chef`
- money is represented as decimal strings
- all responses carry `schema_version`, `request_id`, `tenant_id`, `generated_at`, and provenance

## Current phase

The first implementation phase is contract validation and an in-memory read-only reference adapter using synthetic fixtures. It does not ingest the Bistek dataset, does not scan API_STORAGE, does not index or embed content, and does not deploy anything.
