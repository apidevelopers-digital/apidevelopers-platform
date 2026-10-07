export const FAMILY_DATA_SCHEMA_VERSION = "family-data-core.v1";
export const FAMILY_DATA_TENANT = "homosapiens-id";

export function createFamilyDataEnvelope({
  requestId,
  data,
  provenance = {},
  generatedAt = new Date().toISOString()
}) {
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
