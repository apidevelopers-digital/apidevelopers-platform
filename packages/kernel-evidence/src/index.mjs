import { createHash } from "node:crypto";

const TYPES = new Set(["runtime-report", "decision", "approval", "audit", "test"]);
const STATUSES = new Set(["active", "superseded", "revoked", "expired"]);
const SECRET_KEY = /(^|[_-])(password|passwd|secret|token|api[_-]?key|authorization|private[_-]?key|database[_-]?url|bearer)($|[_-])/i;
const SECRET_VALUE = /(-----BEGIN [A-Z ]*PRIVATE KEY-----|bearer\s+[a-z0-9._~+/=-]{8,})/i;

const clone = (value) => (value == null ? value : structuredClone(value));

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

function digest(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function assertObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
}

function assertString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

function assertSafe(value, path = "$") {
  if (typeof value === "string") {
    if (SECRET_VALUE.test(value)) {
      throw new Error(`secret-like value blocked at ${path}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafe(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) {
      throw new Error(`secret-like field blocked at ${path}.${key}`);
    }
    assertSafe(child, `${path}.${key}`);
  }
}

function parseTime(value, name) {
  assertString(value, name);
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new TypeError(`${name} must be an ISO timestamp`);
  return time;
}

function normalize(input, { clock, previousDigest }) {
  assertObject(input, "evidence");
  for (const field of ["evidenceId", "tenantId", "cycleId", "type", "source", "payload"]) {
    if (input[field] == null || input[field] === "") throw new Error(`${field} is required`);
  }
  assertString(input.evidenceId, "evidenceId");
  assertString(input.tenantId, "tenantId");
  assertString(input.cycleId, "cycleId");
  assertString(input.type, "type");
  assertObject(input.source, "source");
  assertObject(input.payload, "payload");
  if (!TYPES.has(input.type)) throw new Error(`unsupported evidence type: ${input.type}`);

  const createdAt = input.createdAt ?? clock();
  const createdTime = parseTime(createdAt, "createdAt");
  const expiresAt = input.expiresAt ?? null;
  if (expiresAt != null && parseTime(expiresAt, "expiresAt") <= createdTime) {
    throw new Error("expiresAt must be after createdAt");
  }

  const status = input.status ?? "active";
  if (!STATUSES.has(status)) throw new Error(`unsupported evidence status: ${status}`);

  const unsigned = {
    schemaVersion: 2,
    evidenceId: input.evidenceId,
    tenantId: input.tenantId,
    cycleId: input.cycleId,
    type: input.type,
    source: clone(input.source),
    payload: clone(input.payload),
    status,
    createdAt,
    expiresAt,
    correlationId: input.correlationId ?? input.cycleId,
    previousDigest: input.previousDigest ?? previousDigest ?? null,
    metadata: {
      immutable: true,
      redacted: true,
      schemaVersion: 2,
      ...(clone(input.metadata ?? {})),
    },
  };

  assertSafe(unsigned);
  return deepFreeze({
    ...unsigned,
    integrity: { algorithm: "sha256", digest: digest(unsigned) },
  });
}

function unsignedRecord(record) {
  const { integrity, lifecycle, ...unsigned } = record;
  return unsigned;
}

export function verifyEvidence(record) {
  if (!record?.integrity || record.integrity.algorithm !== "sha256") return false;
  if (typeof record.integrity.digest !== "string" || !/^[a-f0-9]{64}$/.test(record.integrity.digest)) return false;
  return digest(unsignedRecord(record)) === record.integrity.digest;
}

export function isEvidenceUsable(record, { at = new Date().toISOString(), lifecycle = "active" } = {}) {
  if (!verifyEvidence(record)) return false;
  if (record.status !== "active" || lifecycle !== "active") return false;
  if (record.expiresAt == null) return true;
  return parseTime(record.expiresAt, "expiresAt") > parseTime(at, "at");
}

function lifecycleEvent({ eventId, evidenceId, tenantId, cycleId, type, reason, replacementEvidenceId = null, createdAt }) {
  const unsigned = {
    schemaVersion: 1,
    eventId,
    evidenceId,
    tenantId,
    cycleId,
    type,
    reason,
    replacementEvidenceId,
    createdAt,
  };
  assertSafe(unsigned);
  return deepFreeze({
    ...unsigned,
    integrity: { algorithm: "sha256", digest: digest(unsigned) },
  });
}

export function createEvidenceRegistry({ clock = () => new Date().toISOString() } = {}) {
  if (typeof clock !== "function") throw new TypeError("clock must be a function");
  const records = new Map();
  const lifecycle = new Map();
  const heads = new Map();

  const chainKey = (tenantId, cycleId) => `${tenantId}\u0000${cycleId}`;
  const lifecycleFor = (evidenceId) => lifecycle.get(evidenceId) ?? [];
  const currentLifecycle = (evidenceId, at = clock()) => {
    const record = records.get(evidenceId);
    if (!record) return "missing";
    if (record.status !== "active") return record.status;
    const events = lifecycleFor(evidenceId);
    const last = events.at(-1);
    if (last?.type === "revoked") return "revoked";
    if (last?.type === "superseded") return "superseded";
    if (record.expiresAt != null && Date.parse(record.expiresAt) <= Date.parse(at)) return "expired";
    return "active";
  };

  return Object.freeze({
    record(input) {
      if (records.has(String(input?.evidenceId))) {
        throw new Error(`duplicate evidenceId: ${input?.evidenceId}`);
      }
      const key = chainKey(String(input?.tenantId ?? ""), String(input?.cycleId ?? ""));
      const previousDigest = heads.get(key) ?? null;
      if (input?.previousDigest != null && input.previousDigest !== previousDigest) {
        throw new Error("previousDigest does not match the current tenant-cycle head");
      }
      const record = normalize(input, { clock, previousDigest });
      records.set(record.evidenceId, record);
      heads.set(key, record.integrity.digest);
      return deepFreeze(clone(record));
    },

    get(evidenceId, { tenantId, cycleId, at = clock(), includeInactive = false } = {}) {
      const record = records.get(String(evidenceId));
      if (!record) return null;
      if (tenantId && record.tenantId !== String(tenantId)) return null;
      if (cycleId && record.cycleId !== String(cycleId)) return null;
      if (!includeInactive && currentLifecycle(record.evidenceId, at) !== "active") return null;
      return deepFreeze(clone(record));
    },

    list({ tenantId, cycleId, type, at = clock(), includeInactive = false } = {}) {
      return [...records.values()]
        .filter((record) => !tenantId || record.tenantId === String(tenantId))
        .filter((record) => !cycleId || record.cycleId === String(cycleId))
        .filter((record) => !type || record.type === type)
        .filter((record) => includeInactive || currentLifecycle(record.evidenceId, at) === "active")
        .sort((left, right) =>
          left.createdAt.localeCompare(right.createdAt) ||
          left.evidenceId.localeCompare(right.evidenceId),
        )
        .map((record) => deepFreeze(clone(record)));
    },

    status(evidenceId, { at = clock() } = {}) {
      return currentLifecycle(String(evidenceId), at);
    },

    revoke(evidenceId, { tenantId, cycleId, reason = "revoked", createdAt = clock() } = {}) {
      const record = records.get(String(evidenceId));
      if (!record) return null;
      if (tenantId && record.tenantId !== String(tenantId)) return null;
      if (cycleId && record.cycleId !== String(cycleId)) return null;
      if (currentLifecycle(record.evidenceId, createdAt) !== "active") {
        throw new Error("evidence is not active");
      }
      const events = lifecycleFor(record.evidenceId);
      const event = lifecycleEvent({
        eventId: `lifecycle.${record.evidenceId}.${events.length + 1}`,
        evidenceId: record.evidenceId,
        tenantId: record.tenantId,
        cycleId: record.cycleId,
        type: "revoked",
        reason: String(reason),
        createdAt,
      });
      lifecycle.set(record.evidenceId, [...events, event]);
      return deepFreeze(clone(event));
    },

    supersede(evidenceId, { tenantId, cycleId, replacementEvidenceId, reason = "superseded", createdAt = clock() } = {}) {
      assertString(replacementEvidenceId, "replacementEvidenceId");
      const record = records.get(String(evidenceId));
      const replacement = records.get(String(replacementEvidenceId));
      if (!record || !replacement) return null;
      if (record.tenantId !== replacement.tenantId || record.cycleId !== replacement.cycleId) {
        throw new Error("replacement evidence must share tenant and cycle");
      }
      if (tenantId && record.tenantId !== String(tenantId)) return null;
      if (cycleId && record.cycleId !== String(cycleId)) return null;
      if (currentLifecycle(record.evidenceId, createdAt) !== "active") {
        throw new Error("evidence is not active");
      }
      const events = lifecycleFor(record.evidenceId);
      const event = lifecycleEvent({
        eventId: `lifecycle.${record.evidenceId}.${events.length + 1}`,
        evidenceId: record.evidenceId,
        tenantId: record.tenantId,
        cycleId: record.cycleId,
        type: "superseded",
        reason: String(reason),
        replacementEvidenceId: replacement.evidenceId,
        createdAt,
      });
      lifecycle.set(record.evidenceId, [...events, event]);
      return deepFreeze(clone(event));
    },

    history(evidenceId, { tenantId, cycleId } = {}) {
      const record = records.get(String(evidenceId));
      if (!record) return [];
      if (tenantId && record.tenantId !== String(tenantId)) return [];
      if (cycleId && record.cycleId !== String(cycleId)) return [];
      return lifecycleFor(record.evidenceId).map((event) => deepFreeze(clone(event)));
    },

    verifyChain({ tenantId, cycleId } = {}) {
      assertString(tenantId, "tenantId");
      assertString(cycleId, "cycleId");
      const chain = [...records.values()]
        .filter((record) => record.tenantId === tenantId && record.cycleId === cycleId);
      let previous = null;
      for (const record of chain) {
        if (!verifyEvidence(record) || record.previousDigest !== previous) return false;
        previous = record.integrity.digest;
      }
      return true;
    },
  });
}

export const evidenceTypes = Object.freeze([...TYPES]);
export const evidenceStatuses = Object.freeze([...STATUSES]);
