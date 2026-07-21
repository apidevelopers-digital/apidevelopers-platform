import { canonicalSerialize, sha256 } from "./index.mjs";

export const PORTAL_INSTITUTIONAL_TYPES = Object.freeze([
  "SourceRef", "Node", "Relation", "Evidence",
  "StateSnapshot", "Iteration", "Approval", "AuditEvent",
]);

const ORDER = new Map(PORTAL_INSTITUTIONAL_TYPES.map((type, index) => [type, index]));
const REQUIRED = Object.freeze({
  SourceRef: ["repository", "commit", "path", "checksum"],
  Node: ["id", "type", "name", "status", "owner", "source_ref"],
  Relation: ["id", "type", "from", "to", "source_ref"],
  Evidence: ["id", "type", "status", "subject_id", "source_ref"],
  StateSnapshot: ["id", "scope", "status", "head", "captured_at", "source_ref"],
  Iteration: ["id", "title", "status", "scope", "authorized_actions", "forbidden_actions", "source_ref"],
  Approval: ["id", "action_id", "status", "approved_by", "approved_at", "scope", "source_ref"],
  AuditEvent: ["id", "action_id", "actor_id", "result", "executed_at", "source_ref"],
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
function object(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function hasAll(value, fields) {
  return fields.every((field) => Object.hasOwn(value, field));
}
function classify(value) {
  const matches = PORTAL_INSTITUTIONAL_TYPES.filter((type) =>
    hasAll(value, REQUIRED[type]) && !(type === "SourceRef" && Object.hasOwn(value, "id"))
  );
  if (matches.length > 1) {
    fail("PORTAL_TYPED_EXTRACTOR_AMBIGUOUS", "yaml block matches more than one institutional type", { matches });
  }
  return matches[0] ?? null;
}
function string(value, field, type) {
  if (typeof value !== "string" || value.trim() === "") {
    fail("PORTAL_TYPED_EXTRACTOR_FIELD_INVALID", `${type}.${field} must be a non-empty string`, { type, field });
  }
}
function array(value, field, type) {
  if (!Array.isArray(value)) {
    fail("PORTAL_TYPED_EXTRACTOR_FIELD_INVALID", `${type}.${field} must be an array`, { type, field });
  }
}
function validateRef(value, context) {
  if (!object(value)) fail("PORTAL_TYPED_EXTRACTOR_SOURCE_REF_INVALID", "source_ref must be an object", context);
  for (const field of ["commit", "path", "checksum"]) string(value[field], field, "SourceRef");
  if (!/^[0-9a-f]{40}$/i.test(value.commit)) {
    fail("PORTAL_TYPED_EXTRACTOR_SOURCE_REF_INVALID", "source_ref.commit must be a full SHA", context);
  }
}
function validate(type, value, sourceCommit) {
  for (const field of REQUIRED[type]) {
    if (!Object.hasOwn(value, field)) {
      fail("PORTAL_TYPED_EXTRACTOR_FIELD_MISSING", `${type}.${field} is required`, { type, field });
    }
  }
  if (type === "SourceRef") {
    for (const field of REQUIRED.SourceRef) string(value[field], field, type);
    if (!/^[0-9a-f]{40}$/i.test(value.commit)) {
      fail("PORTAL_TYPED_EXTRACTOR_SOURCE_REF_INVALID", "SourceRef.commit must be a full SHA", { type });
    }
    if (value.commit !== sourceCommit) {
      fail("PORTAL_TYPED_EXTRACTOR_MIXED_COMMIT", "SourceRef belongs to another commit", {
        expected: sourceCommit, observed: value.commit,
      });
    }
    return;
  }

  string(value.id, "id", type);
  const stringFields = new Set([
    "type", "name", "status", "owner", "from", "to", "subject_id", "head",
    "captured_at", "title", "action_id", "approved_by", "approved_at",
    "actor_id", "result", "executed_at",
  ]);
  for (const field of REQUIRED[type]) {
    if (stringFields.has(field)) string(value[field], field, type);
  }
  if (type === "Iteration") {
    for (const field of ["scope", "authorized_actions", "forbidden_actions"]) array(value[field], field, type);
  }
  if (type === "Approval") array(value.scope, "scope", type);

  validateRef(value.source_ref, { type, id: value.id });
  if (value.source_ref.commit !== sourceCommit) {
    fail("PORTAL_TYPED_EXTRACTOR_MIXED_COMMIT", "record source_ref belongs to another commit", {
      type, id: value.id, expected: sourceCommit, observed: value.source_ref.commit,
    });
  }
}
function normalize(type, value, documentRecord, blockIndex) {
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
  if (!object(documentProjection) || !Array.isArray(documentProjection.records)) {
    fail("PORTAL_TYPED_EXTRACTOR_INPUT_INVALID", "document projection with records is required");
  }
  const sourceCommit = documentProjection.sourceCommit;
  if (typeof sourceCommit !== "string" || !/^[0-9a-f]{40}$/i.test(sourceCommit)) {
    fail("PORTAL_TYPED_EXTRACTOR_COMMIT_INVALID", "document projection must expose a full sourceCommit");
  }

  const records = [];
  const ids = new Set();
  for (const documentRecord of [...documentProjection.records].sort((a, b) =>
    String(a.path).localeCompare(String(b.path)))) {
    if (!object(documentRecord) || !Array.isArray(documentRecord.yamlBlocks)) {
      fail("PORTAL_TYPED_EXTRACTOR_DOCUMENT_INVALID", "portal document record must expose yamlBlocks", {
        documentId: documentRecord?.id,
      });
    }
    for (const [blockIndex, block] of documentRecord.yamlBlocks.entries()) {
      const value = block?.value;
      if (!object(value)) continue;
      const type = classify(value);
      if (!type) continue;
      validate(type, value, sourceCommit);
      const record = normalize(type, value, documentRecord, blockIndex);
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
    ORDER.get(a.institutionalType) - ORDER.get(b.institutionalType) ||
    a.institutionalId.localeCompare(b.institutionalId)
  );
  const counts = Object.fromEntries(PORTAL_INSTITUTIONAL_TYPES.map((type) => [type, 0]));
  for (const record of records) counts[record.institutionalType] += 1;

  if (requireAllTypes) {
    const missing = PORTAL_INSTITUTIONAL_TYPES.filter((type) => counts[type] === 0);
    if (missing.length) {
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
    mutationAllowed: false,
  });
}
