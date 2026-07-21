const FULL_SHA = /^[0-9a-f]{40}$/i;

export class PortalInstitutionalReadApiError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "PortalInstitutionalReadApiError";
    this.code = code;
    this.details = structuredClone(details);
  }
}

function fail(code, message, details = {}) {
  throw new PortalInstitutionalReadApiError(code, message, details);
}

function cloneFrozen(value) {
  if (value === null ||
    value === undefined) return value ?? null;
  return Object.freeze(structuredClone(value));
}

function assertReader(reader) {
  if (!reader || typeof reader !== "object" || reader.mutationAllowed !== false) {
    fail(
      "PORTAL_READ_API_READER_INVALID",
      "reader must be an explicit read-only derived store reader",
    );
  }
  for (const method of ["readCurrent", "readByCommit", "listVersions"]) {
    if (typeof reader[method] !== "function") {
      fail("PORTAL_READ_API_READER_INVALID", `reader.${method} must be a function`);
    }
  }
}

function assertCommit(commit) {
  if (!FULL_SHA.test(commit ?? "")) {
    fail("PORTAL_READ_API_COMMIT_INVALID", "commit must be a full SHA");
  }
}

function assertPage(offset, limit) {
  if (!Number.isInteger(offset) || offset < 0) {
    fail("PORTAL_READ_API_OFFSET_INVALID", "offset must be a non-negative integer");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    fail("PORTAL_READ_API_LIMIT_INVALID", "limit must be an integer between 1 and 200");
  }
}

function resolveSnapshot(reader, commit) {
  if (commit === undefined || commit === null) return reader.readCurrent();
  assertCommit(commit);
  return reader.readByCommit(commit);
}

function sortRecords(records) {
  return [...records].sort((a, b) =>
    String(a?.institutionalType ?? "").localeCompare(String(b?.institutionalType ?? "")) ||
    String(a?.institutionalId ?? "").localeCompare(String(b?.institutionalId ?? ""))
  );
}

function paginate(items, offset, limit) {
  return Object.freeze({
    items: Object.freeze(items.slice(offset, offset + limit).map(cloneFrozen)),
    page: Object.freeze({
      offset,
      limit,
      total: items.length,
      hasMore: offset + limit < items.length,
    }),
  });
}

export function createPortalInstitutionalReadApi({ reader } = {}) {
  assertReader(reader);

  function getSnapshot({ commit } = {}) {
    return cloneFrozen(resolveSnapshot(reader, commit));
  }

  function getSummary({ commit } = {}) {
    const snapshot = resolveSnapshot(reader, commit);
    if (!snapshot) return null;

    return Object.freeze({
      sourceRepository: snapshot.sourceRepository ?? null,
      sourceCommit: snapshot.sourceCommit,
      contentChecksum: snapshot.contentChecksum,
      documentCount: snapshot.documentCount ?? null,
      recordCount: snapshot.recordCount ?? (
        Array.isArray(snapshot.records) ? snapshot.records.length : 0
      ),
      counts: cloneFrozen(snapshot.counts ?? {}),
      integrity: cloneFrozen(snapshot.integrity ?? null),
    });
  }

  function listRecords({
    commit,
    institutionalType,
    offset = 0,
    limit = 50,
  } = {}) {
    assertPage(offset, limit);
    const snapshot = resolveSnapshot(reader, commit);
    if (!snapshot) return paginate([], offset, limit);
    if (!Array.isArray(snapshot.records)) {
      fail("PORTAL_READ_API_SNAPSHOT_INVALID", "snapshot.records must be an array");
    }
    if (
      institutionalType !== undefined &&
      (typeof institutionalType !== "string" || institutionalType.trim() === "")
    ) {
      fail("PORTAL_READ_API_TYPE_INVALID", "institutionalType must be a non-empty string");
    }

    const records = sortRecords(snapshot.records).filter((record) =>
      institutionalType === undefined
        ? true
        : record?.institutionalType === institutionalType
    );
    return paginate(records, offset, limit);
  }

  function getRecord({ commit, institutionalType, institutionalId } = {}) {
    if (typeof institutionalType !== "string" || institutionalType.trim() === "") {
      fail("PORTAL_READ_API_TYPE_INVALID", "institutionalType is required");
    }
    if (typeof institutionalId !== "string" || institutionalId.trim() === "") {
      fail("PORTAL_READ_API_ID_INVALID", "institutionalId is required");
    }
    const snapshot = resolveSnapshot(reader, commit);
    if (!snapshot) return null;
    if (!Array.isArray(snapshot.records)) {
      fail("PORTAL_READ_API_SNAPSHOT_INVALID", "snapshot.records must be an array");
    }
    const record = snapshot.records.find((candidate) =>
      candidate?.institutionalType === institutionalType &&
      candidate?.institutionalId === institutionalId
    );
    return cloneFrozen(record ?? null);
  }

  function listVersions({ offset = 0, limit = 50 } = {}) {
    assertPage(offset, limit);
    const versions = reader.listVersions();
    if (!Array.isArray(versions)) {
      fail("PORTAL_READ_API_VERSIONS_INVALID", "reader.listVersions() must return an array");
    }
    const ordered = [...versions].sort((a, b) =>
      String(a?.sourceCommit ?? "").localeCompare(String(b?.sourceCommit ?? ""))
    );
    return paginate(ordered, offset, limit);
  }

  return Object.freeze({
    getSnapshot,
    getSummary,
    listRecords,
    getRecord,
    listVersions,
    mutationAllowed: false,
  });
}
