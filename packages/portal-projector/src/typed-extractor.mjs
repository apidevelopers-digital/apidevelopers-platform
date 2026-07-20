
import { canonicalSerialize, sha256 } from "./index.mjs";

export const PORTAL_INSTITUTIONAL_TYPES = Object.freeze([
  "SourceRef",
  "Node",
  "Relation",
  "Evidence",
  "StateSnapshot",
  "Iteration",
  "Approval",
  "AuditEvent",
]);

const TYPE_ORDER = new Map(PORTAL_INSTITUTIONAL_TYPES.map((type, index) => [type, index]));

const SIGNATURES = Object.freeze({
  SourceRef: {
    required: ["repository", "commit", "path", "checksum"],
    forbidden: ["id"],
  },
  Node: {
    required: ["id", "type", "name", "status", "owner", "source_ref"],
  },
  Relation: {
    required: ["id", "type", "from", "to", "source_ref"],
  },
  Evidence: {
    required: ["id", "type", "status", "subject_id", "source_ref"],
  },
  StateSnapshot: {
    required: ["id", "scope", "status", "head", "captured_at", "source_ref"],
  },
  Iteration: {
    required: ["id", "title", "status", "scope", "authorized_actions", "forbidden_actions", "source_ref"],
  },
  Approval: {
    required: ["id", "action_id", "status", "approved_by", "approved_at", "scope", "source_ref"],
  },
  AuditEvent: {
    required: ["id", "action_id", "actor_id", "result", "executed_at", "source_ref"],
  },
});

export class PortalTypedExtractorError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "PortalTypedExtractorError";
    this.code = code;
    this.details = structuredClone(details);
  }
}

function fail(code, message, details = {}) {
  throw new PortalTypedExtractorError(code, message, details);
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasAll(value, fields) {
  return fields.every((field) => Object.hasOwn(value, field));
}

function classify(value) {
  const matches = [];
  for (const type of PORTAL_INSTITUTIONAL_TYPES) {
    const signature = SIGNATURES[type];
    if (!hasAll(value, signature.required)) continue;
    if (signature.forbidden?.some((field) => Object.hasOwn(value, field))) continue;
    matches.push(type);
  }
  if (matches.length > 1) {
    fail("PORTAL_TYPED_EXTRACTOR_AMBIGUOUS", "yaml block matches more than one institutional type", { matches, value });
  }
  return matches[0] ?? null;
}

function assertString(value, field, type) {
  if (typeof value !== "string" || value.trim() === "") {
    fail("PORTAL_TYPED_EXTRACTOR_FIELD_INVALID", `${type}.${field} must be a non-empty string`, { type, field });
  }
}

function assertArray(value, field, type) {
  if (!Array.isArray(value)) {
    fail("PORTAL_TYPED_EXTRACTOR_FIELD_INVALID", `${type}.${field} must be an array`, { type, field });
  }
}

function validateSourceRef(value, context) {
  if (!isObject(value)) {
    fail("PORTAL_TYPED_EXTRACTOR_SOURCE_REF_INVALID", "source_ref must be an object", context);
  }
  for (const field of ["commit", "path", "checksum"]) assertString(value[field], field, "SourceRef");
  if (!/^[0-9a-f]{40}$/i.test(value.commit)) {
    fail("PORTAL_TYPED_EXTRACTOR_SOURCE_REF_INVALID", "source_ref.commit must be a full SHA", context);
  }
}

function validateByType(type, value, sourceCommit) {
  for (const field of SIGNATURES[type].required) {
    if (!Object.hasOwn(value, field)) {
      fail("PORTAL_TYPED_EXTRACTOR_FIELD_MISSING", `${type}.${field} is required`, { type, field });
    }
  }

  if (type === "SourceRef") {
    for (const field of ["repository", "commit", "path", "checksum"]) assertString(value[field], field, type);
    if (!/^[0-9a-f]{40}$/i.test(value.commit)) {
      fail("PORTAL_TYPED_EXTRACTOR_SOURCE_REF_INVALID", "SourceRef.commit must be a full SHA", { type });
    }
    if (sourceCommit && value.commit !== sourceCommit) {
      fail("PORTAL_TYPED_EXTRACTOR_MIXED_COMMIT", "SourceRef belongs to another commit", {
        expected: sourceCommit,
        observed: value.commit,
      });
    }
    return;
  }

  assertString(value.id, "id", type);
  for (const field of SIGNATURES[type].required.filter((field) =>
    ["type", "name", "status", "owner", "from", "to", "subject_id", "scope", "head", "captured_at",
     "title", "action_id", "approved_by", "approved_at", "actor_id", "result", "executed_at"].includes(field))) {
    assertString(value[field], field, type);
  }
  for (const field of ["scope", "authorized_actions", "forbidden_actions"]) {
    if (Object.hasOwn(value, field) && (type === "Iteration" || type === "Approval")) assertArray(value[field], field, type);
  }
  validateSourceRef(value.source_ref, { type, id: value.id });
  if (sourceCommit && value.source_ref.commit !== sourceCommit) {
    fail("PORTAL_TYPED_EXTRACTOR_MIXED_COMMIT", "record source_ref belongs to another commit", {
      type,
      id: value.id,
      expected: sourceCommit,
      observed: value.source_ref.commit,
    });
  }
}

function normalizeRecord(type, value, documentRecord, blockIndex) {
  const sourceRef = type === "SourceRef"
    ? {
        repository: value.repository,
        commit: value.commit,
        path: value.path,
        checksum: value.checksum,
        ...(value.anchor ? { anchor: value.anchor } : {}),
      }
    : structuredClone(value.source_ref);

  return Object.freeze({
    institutionalType: type,
    institutionalId: type === "SourceRef"
      ? `source-ref:${sourceRef.commit}:${sourceRef.path}${sourceRef.anchor ? `#${sourceRef.anchor}` : ""}`
      : value.id,
    value: Object.freeze(structuredClone(value)),
    sourceRef: Object.freeze(sourceRef),
    extractedFrom: Object.freeze({
      documentId: documentRecord.id,
      documentPath: documentRecord.path,
      yamlBlockIndex: blockIndex,
    }),
  });
}

export function extractInstitutionalRecords(documentProjection, {
  schemaVersion = "portal.institutional-projection/v1",
  extractorVersion = "0.1.0",
  requireAllTypes = false,
} = {}) {
  if (!isObject(documentProjection) || !Array.isArray(documentProjection.records)) {
    fail("PORTAL_TYPED_EXTRACTOR_INPUT_INVALID", "document projection with records is required");
  }
  const sourceCommit = documentProjection.sourceCommit;
  if (typeof sourceCommit !== "string" || !/^[0-9a-f]{40}$/i.test(sourceCommit)) {
    fail("PORTAL_TYPED_EXTRACTOR_COMMIT_INVALID", "document projection must expose a full sourceCommit");
  }

  const records = [];
  const ids = new Set();

  for (const documentRecord of [...documentProjection.records].sort((a, b) => String(a.path).localeCompare(String(b.path)))) {
    if (!isObject(documentRecord) || !Array.isArray(documentRecord.yamlBlocks)) {
      fail("PORTAL_TYPED_EXTRACTOR_DOCUMENT_INVALID", "portal document record must expose yamlBlocks", {
        documentId: documentRecord?.id,
      });
    }
    for (const [blockIndex, block] of documentRecord.yamlBlocks.entries()) {
      const value = block?.value;
      if (!isObject(value)) continue;
      const type = classify(value);
      if (!type) continue;
      validateByType(type, value, sourceCommit);
      const record = normalizeRecord(type, value, documentRecord, blockIndex);
      const key = `${record.institutionalType}:${record.institutionalId}`;
      if (ids.has(key)) {
        fail("PORTAL_TYPED_EXTRACTOR_DUPLICATE_ID", "duplicate institutional identifier", {
          institutionalType: record.institutionalType,
          institutionalId: record.institutionalId,
        });
      }
      ids.add(key);
      records.push(record);
    }
  }

  records.sort((a, b) =>
    TYPE_ORDER.get(a.institutionalType) - TYPE_ORDER.get(b.institutionalType) ||
    a.institutionalId.localeCompare(b.institutionalId));

  const counts = Object.fromEntries(PORTAL_INSTITUTIONAL_TYPES.map((type) => [type, 0]));
  for (const record of records) counts[record.institutionalType] += 1;

  if (requireAllTypes) {
    const missing = PORTAL_INSTITUTIONAL_TYPES.filter((type) => counts[type] === 0);
    if (missing.length > 0) {
      fail("PORTAL_TYPED_EXTRACTOR_TYPES_MISSING", "required institutional types are missing", { missing });
    }
  }

  const logical = {
    schemaVersion,
    sourceRepository: documentProjection.sourceRepository,
    sourceCommit,
    extractorVersion,
    recordCount: records.length,
    counts,
    records,
  };

  return Object.freeze({
    ...logical,
    contentChecksum: sha256(canonicalSerialize(logical)),
  });
}

export function createPortalTypedExtractor(options = {}) {
  return Object.freeze({
    extract: (documentProjection) => extractInstitutionalRecords(documentProjection, options),
    mutationAlowed: false,
  });
}
