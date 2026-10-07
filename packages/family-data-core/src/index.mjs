import { createInMemoryFamilyDataCore } from "./in-memory-store.mjs";

export const FAMILY_DATA_SCHEMA_VERSION = "family-data-core.v1";
export const FAMILY_DATA_TENANT = "homosapiens-id";

export { createInMemoryFamilyDataCore };
export { buildFamilyDataCoreSchemaSql } from "./postgres-schema.mjs";
export { createPostgresFamilyDataReadStore } from "./postgres-read-store.mjs";
export { createFamilyDataMcpReadTools, assertFamilyDataMcpReadOnly } from "./mcp-read-tools.mjs";

export function createFamilyDataEnvelope({ requestId, data, provenance = {}, generatedAt = new Date().toISOString() }) {
  if (!requestId) throw new TypeError("requestId is required");
  return {
    schema_version: FAMILY_DATA_SCHEMA_VERSION,
    request_id: requestId,
    tenant_id: FAMILY_DATA_TENANT,
    generated_at: generatedAt,
    data,
    provenance: {
      source_ids: provenance.source_ids ?? [],
      evidence_ids: provenance.evidence_ids ?? [],
      dataset_ids: provenance.dataset_ids ?? []
    }
  };
}

export const familyDataCapabilities = Object.freeze({
  read: [
    "family.purchase.list",
    "family.purchase.get",
    "family.product.stats",
    "family.product.price_history",
    "family.context.chef",
    "family.evidence.get"
  ],
  write: []
});
