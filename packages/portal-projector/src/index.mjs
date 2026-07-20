import { createHash } from "node:crypto";

export class PortalProjectorError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "PortalProjectorError";
    this.code = code;
    this.details = structuredClone(details);
  }
}

function fail(code, message, details) {
  throw new PortalProjectorError(code, message, details);
}

function assertObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("PORTAL_PROJECTOR_SOURCE_INVALID", `${name} must be an object`);
  }
}

function assertString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    fail("PORTAL_PROJECTOR_SOURCE_INVALID", `${name} must be a non-empty string`);
  }
}

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, normalize(value[key])]),
    );
  }
  return value;
}

export function canonicalSerialize(value) {
  return JSON.stringify(normalize(value));
}

export function sha256(value) {
  return createHash("sha256").update(
    typeof value === "string" ? value : canonicalSerialize(value),
    "utf8",
  ).digest("hex");
}

function validateSourceRef(sourceRef, sourcePath, commit) {
  assertObject(sourceRef, "record.sourceRef");
  assertString(sourceRef.path, "record.sourceRef.path");
  assertString(sourceRef.commit, "record.sourceRef.commit");
  assertString(sourceRef.checksum, "record.sourceRef.checksum");
  if (sourceRef.path !== sourcePath || sourceRef.commit !== commit) {
    fail("PORTAL_PROJECTOR_SOURCE_INVALID", "record sourceRef does not match fixed input", {
      sourcePath,
      commit,
      sourceRef,
    });
  }
}

function validateRecord(record, sourcePath, commit, ids) {
  assertObject(record, "record");
  assertString(record.id, "record.id");
  assertString(record.type, "record.type");
  validateSourceRef(record.sourceRef, sourcePath, commit);
  if (ids.has(record.id)) {
    fail("PORTAL_PROJECTOR_DUPLICATE_ID", `duplicate record id: ${record.id}`);
  }
  ids.add(record.id);
}

export function extractRecords({ repository, commit, sources }) {
  assertString(repository, "repository");
  assertString(commit, "commit");
  if (!/^[0-9a-f]{40}$/i.test(commit)) {
    fail("PORTAL_PROJECTOR_SOURCE_INVALID", "commit must be a full SHA");
  }
  if (!Array.isArray(sources)) {
    fail("PORTAL_PROJECTOR_SOURCE_INVALID", "sources must be an array");
  }

  const ids = new Set();
  const records = [];
  for (const source of [...sources].sort((a, b) => String(a.path).localeCompare(String(b.path)))) {
    assertObject(source, "source");
    assertString(source.path, "source.path");
    assertString(source.checksum, "source.checksum");
    if (!Array.isArray(source.records)) {
      fail("PORTAL_PROJECTOR_SOURCE_INVALID", "source.records must be an array", { path: source.path });
    }
    const computed = sha256(source.records);
    if (computed !== source.checksum) {
      fail("PORTAL_PROJECTOR_CHECKSUM_MISMATCH", "source checksum mismatch", {
        path: source.path,
        expected: source.checksum,
        observed: computed,
      });
    }
    for (const record of source.records) {
      validateRecord(record, source.path, commit, ids);
      records.push(structuredClone(record));
    }
  }
  return records.sort((a, b) => a.id.localeCompare(b.id));
}

export function buildProjection(input, {
  schemaVersion = "portal.projection/v1",
  projectorVersion = "0.1.0",
} = {}) {
  const records = extractRecords(input);
  const logical = {
    schemaVersion,
    sourceRepository: input.repository,
    sourceCommit: input.commit,
    projectorVersion,
    recordCount: records.length,
    records,
  };
  return Object.freeze({
    ...logical,
    contentChecksum: sha256(logical),
  });
}

export function reconcile(expected, observed) {
  assertObject(expected, "expected");
  assertObject(observed, "observed");
  const findings = [];
  if (expected.sourceCommit !== observed.sourceCommit) {
    findings.push({ code: "PORTAL_PROJECTOR_STALE", field: "sourceCommit" });
  }
  if (expected.contentChecksum !== observed.contentChecksum) {
    findings.push({ code: "PORTAL_PROJECTOR_DIVERGENT", field: "contentChecksum" });
  }
  if (expected.recordCount !== observed.recordCount) {
    findings.push({ code: "PORTAL_PROJECTOR_DIVERGENT", field: "recordCount" });
  }
  return Object.freeze({
    status: findings.length === 0 ? "in_sync" : "divergent",
    findings,
  });
}

export async function publishAtomically(projection, {
  stage,
  validate = async () => true,
  activate,
  audit = async () => {},
} = {}) {
  if (typeof stage !== "function" || typeof activate !== "function") {
    fail("PORTAL_PROJECTOR_PUBLISH_FAILED", "stage and activate adapters are required");
  }
  const staged = await stage(structuredClone(projection));
  const valid = await validate(staged, projection);
  if (!valid) {
    fail("PORTAL_PROJECTOR_PUBLISH_FAILED", "staged projection failed validation");
  }
  const result = await activate(staged);
  await audit({
    type: "portal_projection_published",
    sourceCommit: projection.sourceCommit,
    contentChecksum: projection.contentChecksum,
  });
  return result;
}

export function createPortalProjector(options = {}) {
  return Object.freeze({
    project: (input) => buildProjection(input, options),
    reconcile,
    publishAtomically,
    mutationAllowed: false,
  });
}
