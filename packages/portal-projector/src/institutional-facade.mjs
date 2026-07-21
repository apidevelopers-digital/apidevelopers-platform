import { canonicalSerialize, sha256 } from "./index.mjs";
import { projectPortalDocuments } from "./document-pipeline.mjs";
import { extractInstitutionalRecords } from "./typed-extractor.mjs";
import { reconcileTypedIntegrity } from "./typed-integrity.mjs";

export class PortalInstitutionalFacadeError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "PortalInstitutionalFacadeError";
    this.code = code;
    this.details = structuredClone(details);
  }
}

function fail(code, message, details = {}) {
  throw new PortalInstitutionalFacadeError(code, message, details);
}

function assertFunction(value, name) {
  if (typeof value !== "function") {
    fail("PORTAL_INSTITUTIONAL_FACADE_ADAPTER_INVALID", `${name} must be a function`);
  }
}

function assertCommit(stage, observed, expected) {
  if (observed !== expected) {
    fail(
      "PORTAL_INSTITUTIONAL_FACADE_COMMIT_MISMATCH",
      `${stage} projection belongs to another commit`,
      { stage, expected, observed },
    );
  }
}

export async function projectPortalInstitutionalState({
  reader,
  documentOptions = {},
  extractionOptions = {},
  integrityOptions = {},
  documentProjector = projectPortalDocuments,
  typedExtractor = extractInstitutionalRecords,
  integrityValidator = reconcileTypedIntegrity,
  schemaVersion = "portal.institutional-state/v1",
  facadeVersion = "0.1.0",
} = {}) {
  assertFunction(documentProjector, "documentProjector");
  assertFunction(typedExtractor, "typedExtractor");
  assertFunction(integrityValidator, "integrityValidator");

  if (!reader || typeof reader !== "object" || reader.mutationAllowed !== false) {
    fail(
      "PORTAL_INSTITUTIONAL_FACADE_READER_INVALID",
      "reader must be an explicitly read-only object",
    );
  }

  const documentProjection = await documentProjector({
    ...documentOptions,
    reader,
  });

  const sourceCommit = documentProjection?.sourceCommit;
  if (typeof sourceCommit !== "string" || !/^[0-9a-f]{40}$/i.test(sourceCommit)) {
    fail(
      "PORTAL_INSTITUTIONAL_FACADE_COMMIT_INVALID",
      "document projection must expose a full sourceCommit SHA",
    );
  }

  if (reader.commit !== undefined) {
    assertCommit("document", sourceCommit, reader.commit);
  }

  const typedProjection = await typedExtractor(
    documentProjection,
    extractionOptions,
  );
  assertCommit("typed", typedProjection?.sourceCommit, sourceCommit);

  const integrity = await integrityValidator(
    typedProjection,
    integrityOptions,
  );
  assertCommit("integrity", integrity?.sourceCommit, sourceCommit);

  if (integrity?.status !== "in_sync") {
    fail(
      "PORTAL_INSTITUTIONAL_FACADE_INTEGRITY_INVALID",
      "institutional projection failed typed integrity",
      { integrity },
    );
  }

  const logical = {
    schemaVersion,
    facadeVersion,
    sourceRepository:
      typedProjection.sourceRepository ?? documentProjection.sourceRepository,
    sourceCommit,
    documentProjectionChecksum: documentProjection.contentChecksum,
    typedProjectionChecksum: typedProjection.contentChecksum,
    documentCount: documentProjection.documentCount,
    recordCount: typedProjection.recordCount,
    counts: typedProjection.counts,
    records: typedProjection.records,
    integrity: {
      status: integrity.status,
      checkedRecordCount: integrity.checkedRecordCount,
      findingCount: integrity.findingCount,
    },
  };

  return Object.freeze({
    ...logical,
    contentChecksum: sha256(canonicalSerialize(logical)),
  });
}

export function createPortalInstitutionalFacade(options = {}) {
  return Object.freeze({
    project: (reader) =>
      projectPortalInstitutionalState({
        ...options,
        reader,
      }),
    mutationAllowed: false,
  });
}
