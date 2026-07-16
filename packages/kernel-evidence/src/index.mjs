import { createHash } from "node:crypto";

const SECRET_KEY = /(^|[_-])(password|passwd|secret|token|api[_-]?key|authorization|private[_-]?key|database[_-]?url|bearer)($|[_-])/i;
const STATUSES = new Set(["active", "superseded", "revoked"]);
const TYPES = new Set(["runtime-report", "decision", "approval", "audit", "test"]);

function clone(value) {
  return value == null ? value : structuredClone(value);
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}
function digest(value) {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
function assertSafe(value, path = "$") {
  if (Array.isArray(value)) return value.forEach((item, index) => assertSafe(item, `${path}[${index}]`));
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) throw new Error(`secret-like field blocked at ${path}.${key}`);
    assertSafe(child, `${path}.${key}`);
  }
}
function normalize(input, clock) {
  if (!input || typeof input !== "object") throw new TypeError("evidence must be an object");
  for (const field of ["evidenceId", "tenantId", "type", "source", "payload"]) {
    if (input[field] == null || input[field] === "") throw new Error(`${field} is required`);
  }
  if (!TYPES.has(input.type)) throw new Error(`unsupported evidence type: ${input.type}`);
  const record = {
    evidenceId: String(input.evidenceId),
    tenantId: String(input.tenantId),
    type: input.type,
    source: clone(input.source),
    payload: clone(input.payload),
    status: input.status ?? "active",
    createdAt: input.createdAt ?? clock(),
    correlationId: input.correlationId ? String(input.correlationId) : null,
    metadata: clone(input.metadata ?? {}),
  };
  if (!STATUSES.has(record.status)) throw new Error(`unsupported evidence status: ${record.status}`);
  assertSafe(record);
  return { ...record, integrity: { algorithm: "sha256", digest: digest(record) } };
}
export function verifyEvidence(record) {
  if (!record?.integrity?.digest) return false;
  const { integrity, ...unsigned } = record;
  return integrity.algorithm === "sha256" && digest(unsigned) === integrity.digest;
}
export function createEvidenceRegistry({ clock = () => new Date().toISOString() } = {}) {
  const records = new Map();
  return Object.freeze({
    record(input) {
      const record = normalize(input, clock);
      if (records.has(record.evidenceId)) throw new Error(`duplicate evidenceId: ${record.evidenceId}`);
      records.set(record.evidenceId, record);
      return clone(record);
    },
    get(evidenceId, { tenantId } = {}) {
      const record = records.get(String(evidenceId));
      if (!record || (tenantId && record.tenantId !== String(tenantId))) return null;
      return clone(record);
    },
    list({ tenantId, type, status } = {}) {
      return [...records.values()]
        .filter((record) => !tenantId || record.tenantId === String(tenantId))
        .filter((record) => !type || record.type === type)
        .filter((record) => !status || record.status === status)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.evidenceId.localeCompare(b.evidenceId))
        .map(clone);
    },
    revoke(evidenceId, { tenantId, reason = "revoked" } = {}) {
      const current = records.get(String(evidenceId));
      if (!current || (tenantId && current.tenantId !== String(tenantId))) return null;
      const { integrity, ...unsigned } = current;
      const updatedUnsigned = { ...unsigned, status: "revoked", revokedAt: clock(), revocationReason: String(reason) };
      const updated = { ...updatedUnsigned, integrity: { algorithm: "sha256", digest: digest(updatedUnsigned) } };
      records.set(updated.evidenceId, updated);
      return clone(updated);
    },
  });
}
export const evidenceTypes = Object.freeze([...TYPES]);
export const evidenceStatuses = Object.freeze([...STATUSES]);
