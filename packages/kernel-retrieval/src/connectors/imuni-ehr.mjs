
import { createHash } from "node:crypto";

function requiredText(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    const error = new Error(`${field} is required`);
    error.code = "INVALID_ARGUMENT";
    throw error;
  }
  return value.trim();
}

function hash(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

function clip(value, max) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function normalizeResponse(response) {
  if (!response || typeof response !== "object" || response.ok !== true) {
    const error = new Error("Medical provider search did not succeed");
    error.code = "MEDICAL_PROVIDER_SEARCH_FAILED";
    throw error;
  }
  if (response.execution === true || response.readOnly === false || response.read_only === false) {
    const error = new Error("Medical retrieval requires a read-only provider response");
    error.code = "MEDICAL_READ_ONLY_VIOLATION";
    throw error;
  }
  const records = Array.isArray(response.records)
    ? response.records
    : Array.isArray(response.results)
      ? response.results
      : null;
  if (!records) {
    const error = new Error("Medical provider records/results must be an array");
    error.code = "INVALID_MEDICAL_PROVIDER_RESPONSE";
    throw error;
  }
  return records;
}

function normalizeTime(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value.trim().slice(0, 80) : parsed.toISOString();
}

/**
 * R4 read-only adapter for imuni./EHR-like sources.
 *
 * Required client contract:
 *   searchMedicalRecords({
 *     subjectId, purposeOfUse, query, limit
 *   }) -> { ok, readOnly:true|read_only:true, execution:false, records|results:[...] }
 *
 * The adapter never emits patient names, free-text clinical content, provider
 * URLs, raw identifiers or attachment bytes. It emits only a safe clinical
 * label, timing metadata and cryptographic provenance.
 */
export function createImuniEhrConnector({
  searchMedicalRecords,
  id = "imuni-ehr",
} = {}) {
  if (typeof searchMedicalRecords !== "function") {
    const error = new Error("searchMedicalRecords function is required");
    error.code = "INVALID_MEDICAL_CLIENT";
    throw error;
  }

  return Object.freeze({
    id: requiredText(id, "id"),
    type: "medical_record",
    domains: Object.freeze(["medical"]),

    async search(request) {
      const query = requiredText(request?.query, "request.query");
      const subjectId = requiredText(request?.medicalContext?.subjectId, "medicalContext.subjectId");
      const purposeOfUse = requiredText(
        request?.medicalContext?.purposeOfUse,
        "medicalContext.purposeOfUse",
      );
      const limit = Number.isInteger(request?.limit) ? Math.min(request.limit, 50) : 20;

      const response = await searchMedicalRecords({
        subjectId,
        purposeOfUse,
        query,
        limit,
      });
      const records = normalizeResponse(response);

      return records.slice(0, limit).map((record, index) => {
        if (!record || typeof record !== "object") {
          const error = new Error("Medical provider record must be an object");
          error.code = "INVALID_MEDICAL_PROVIDER_RESPONSE";
          throw error;
        }

        const providerId = requiredText(
          record.id || record.recordId || record.providerObjectId || `record-${index}`,
          "medical record id",
        );
        const safeLabel = clip(
          record.safeLabel ||
            record.recordType ||
            record.type ||
            record.category ||
            "Registro clínico",
          160,
        );
        const occurredAt = normalizeTime(
          record.occurredAt ||
            record.date ||
            record.createdAt ||
            record.created_at ||
            record.updatedAt ||
            record.updated_at,
        );
        const providerHash = hash(providerId);
        const subjectHash = hash(subjectId);
        const digest = hash(JSON.stringify({
          providerHash,
          subjectHash,
          purposeOfUse,
          safeLabel,
          occurredAt,
        }));

        return {
          id: `medical:${providerHash.slice(0, 24)}`,
          domain: "medical",
          safeLabel,
          title: safeLabel,
          snippet: "",
          uri: "",
          occurredAt,
          observedAt: typeof request?.requestedAt === "string" ? request.requestedAt : null,
          sensitivity: "restricted",
          providerObjectId: `sha256:${providerHash}`,
          evidenceDigest: `sha256:${digest}`,
        };
      });
    },
  });
}

export const __test = Object.freeze({ normalizeResponse, normalizeTime });
