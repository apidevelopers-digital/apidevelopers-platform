export class PortalDerivedStoreError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "PortalDerivedStoreError";
    this.code = code;
    this.details = structuredClone(details);
  }
}

const FULL_SHA = /^[0-9a-f]{40}$/i;

function fail(code, message, details = {}) {
  throw new PortalDerivedStoreError(code, message, details);
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertProjection(projection) {
  if (!isObject(projection)) {
    fail("PORTAL_DERIVED_STORE_PROJECTION_INVALID", "projection must be an object");
  }
  if (!FULL_SHA.test(projection.sourceCommit ?? "")) {
    fail(
      "PORTAL_DERIVED_STORE_COMMIT_INVALID",
      "projection must expose a full sourceCommit SHA",
    );
  }
  if (
    typeof projection.contentChecksum !== "string" ||
    !/^[0-9a-f]{64}$/i.test(projection.contentChecksum)
  ) {
    fail(
      "PORTAL_DERIVED_STORE_CHECKSUM_INVALID",
      "projection must expose a SHA-256 contentChecksum",
    );
  }
}

function cloneFrozen(value) {
  return Object.freeze(structuredClone(value));
}

export function createPortalDerivedStore() {
  const snapshots = new Map();
  let currentCommit = null;

  function publish(projection, { expectedCurrentCommit } = {}) {
    assertProjection(projection);

    if (
      expectedCurrentCommit !== undefined &&
      expectedCurrentCommit !== currentCommit
    ) {
      fail(
        "PORTAL_DERIVED_STORE_CONFLICT",
        "current projection changed before publication",
        { expectedCurrentCommit, observedCurrentCommit: currentCommit },
      );
    }

    const existing = snapshots.get(projection.sourceCommit);
    if (
      existing &&
      existing.contentChecksum !== projection.contentChecksum
    ) {
      fail(
        "PORTAL_DERIVED_STORE_COMMIT_COLLISION",
        "the same source commit cannot map to different derived content",
        {
          sourceCommit: projection.sourceCommit,
          existingChecksum: existing.contentChecksum,
          observedChecksum: projection.contentChecksum,
        },
      );
    }

    const snapshot = existing ?? cloneFrozen(projection);
    snapshots.set(projection.sourceCommit, snapshot);
    currentCommit = projection.sourceCommit;

    return Object.freeze({
      sourceCommit: snapshot.sourceCommit,
      contentChecksum: snapshot.contentChecksum,
      published: !existing,
    });
  }

  function readCurrent() {
    return currentCommit ? snapshots.get(currentCommit) : null;
  }

  function readByCommit(sourceCommit) {
    if (!FULL_SHA.test(sourceCommit ?? "")) {
      fail(
        "PORTAL_DERIVED_STORE_COMMIT_INVALID",
        "sourceCommit must be a full SHA",
      );
    }
    return snapshots.get(sourceCommit) ?? null;
  }

  function listVersions() {
    return Object.freeze(
      [...snapshots.values()]
        .map((snapshot) =>
          Object.freeze({
            sourceCommit: snapshot.sourceCommit,
            contentChecksum: snapshot.contentChecksum,
          }),
        )
        .sort((a, b) => a.sourceCommit.localeCompare(b.sourceCommit)),
    );
  }

  const reader = Object.freeze({
    readCurrent,
    readByCommit,
    listVersions,
    mutationAllowed: false,
  });

  const publisher = Object.freeze({
    publish,
    mutationAllowed: true,
  });

  return Object.freeze({
    reader,
    publisher,
  });
}
