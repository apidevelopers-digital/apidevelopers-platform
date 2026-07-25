import { createHash } from "node:crypto";

const ALLOWED_TYPES = Object.freeze([
  "problem",
  "plan",
  "decision",
  "execution",
  "outcome",
  "lesson",
  "evidence",
]);

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
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

function normalizeStrings(value, name) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  return [...new Set(value.map((item, index) => {
    assertString(item, `${name}[${index}]`);
    return item.trim();
  }))].sort();
}

function canonicalize(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digestRecord(record) {
  return createHash("sha256").update(canonicalize(record)).digest("hex");
}

function withoutDigest(entry) {
  const copy = clone(entry);
  delete copy.digest;
  return copy;
}

export function verifyMemorySnapshotIntegrity(snapshot) {
  const errors = [];

  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return deepFreeze({ valid: false, entryCount: 0, chainHead: null, errors: ["snapshot-invalid"] });
  }

  const entries = Array.isArray(snapshot.entries) ? snapshot.entries : [];
  let previousDigest = null;

  for (const [index, entry] of entries.entries()) {
    const expectedSequence = index + 1;
    if (entry.sequence !== expectedSequence) {
      errors.push(`sequence-mismatch:${entry.id ?? index}`);
    }
    if (entry.previousDigest !== previousDigest) {
      errors.push(`previous-digest-mismatch:${entry.id ?? index}`);
    }
    if (snapshot.tenantId && entry.tenantId !== snapshot.tenantId) {
      errors.push(`tenant-mismatch:${entry.id ?? index}`);
    }

    const expectedDigest = digestRecord(withoutDigest(entry));
    if (entry.digest !== expectedDigest) {
      errors.push(`digest-mismatch:${entry.id ?? index}`);
    }
    previousDigest = entry.digest ?? null;
  }

  if ((snapshot.entryCount ?? entries.length) !== entries.length) {
    errors.push("entry-count-mismatch");
  }
  if ((snapshot.chainHead ?? null) !== previousDigest) {
    errors.push("chain-head-mismatch");
  }

  return deepFreeze({
    tenantId: snapshot.tenantId ?? null,
    valid: errors.length === 0,
    entryCount: entries.length,
    chainHead: previousDigest,
    errors,
  });
}

export function assertMemorySnapshotIntegrity(snapshot, name = "memorySnapshot") {
  const report = verifyMemorySnapshotIntegrity(snapshot);
  if (!report.valid) {
    throw new Error(`${name} integrity failed: ${report.errors.join(", ")}`);
  }
  return snapshot;
}

export class InstitutionalMemory {
  #entries = [];
  #byId = new Map();

  constructor({ tenantId, clock = () => new Date().toISOString() } = {}) {
    assertString(tenantId, "tenantId");
    if (typeof clock !== "function") throw new TypeError("clock must be a function");
    this.tenantId = tenantId.trim();
    this.clock = clock;
  }

  append(entry) {
    assertObject(entry, "entry");
    assertString(entry.id, "entry.id");
    assertString(entry.type, "entry.type");
    assertString(entry.subject, "entry.subject");
    assertString(entry.cycleId, "entry.cycleId");

    if (entry.tenantId != null && entry.tenantId !== this.tenantId) {
      throw new Error("cross-tenant memory append blocked");
    }
    if (!ALLOWED_TYPES.includes(entry.type)) {
      throw new Error(`unsupported memory type: ${entry.type}`);
    }
    if (this.#byId.has(entry.id)) {
      throw new Error(`memory entry already exists: ${entry.id}`);
    }

    const recordedAt = entry.recordedAt ?? this.clock();
    assertString(recordedAt, "entry.recordedAt");
    const recordedBy = entry.recordedBy ?? "system";
    assertString(recordedBy, "entry.recordedBy");

    const previousDigest = this.#entries.at(-1)?.digest ?? null;
    const base = {
      schemaVersion: 1,
      tenantId: this.tenantId,
      id: entry.id,
      type: entry.type,
      subject: entry.subject,
      cycleId: entry.cycleId,
      status: entry.status ?? "recorded",
      refs: normalizeStrings(entry.refs, "entry.refs"),
      evidence: Array.isArray(entry.evidence) ? clone(entry.evidence) : [],
      data: clone(entry.data ?? {}),
      recordedBy,
      recordedAt,
      sequence: this.#entries.length + 1,
      previousDigest,
    };
    const stored = deepFreeze({ ...base, digest: digestRecord(base) });

    this.#entries.push(stored);
    this.#byId.set(stored.id, stored);
    return deepFreeze(clone(stored));
  }

  get(id) {
    assertString(id, "id");
    const entry = this.#byId.get(id);
    return entry ? deepFreeze(clone(entry)) : null;
  }

  list({ tenantId, cycleId, subject, type, status } = {}) {
    if (tenantId != null && tenantId !== this.tenantId) {
      throw new Error("cross-tenant memory read blocked");
    }

    return deepFreeze(this.#entries
      .filter((entry) => (cycleId ? entry.cycleId === cycleId : true))
      .filter((entry) => (subject ? entry.subject === subject : true))
      .filter((entry) => (type ? entry.type === type : true))
      .filter((entry) => (status ? entry.status === status : true))
      .map(clone));
  }

  cycle(cycleId) {
    assertString(cycleId, "cycleId");
    const entries = this.list({ cycleId });
    return deepFreeze({
      tenantId: this.tenantId,
      cycleId,
      entries,
      summary: entries.reduce(
        (accumulator, entry) => {
          accumulator.total += 1;
          accumulator.byType[entry.type] = (accumulator.byType[entry.type] ?? 0) + 1;
          return accumulator;
        },
        { total: 0, byType: {} },
      ),
    });
  }

  lessons({ subject, cycleId } = {}) {
    return this.list({ subject, cycleId, type: "lesson" });
  }

  snapshot() {
    const entries = this.#entries.map(clone);
    return deepFreeze({
      schemaVersion: 1,
      tenantId: this.tenantId,
      mode: "append-only",
      mutationAllowed: false,
      entryCount: entries.length,
      chainHead: entries.at(-1)?.digest ?? null,
      entries,
    });
  }

  verifyIntegrity() {
    return verifyMemorySnapshotIntegrity(this.snapshot());
  }
}

export function createInstitutionalMemory(options = {}) {
  return new InstitutionalMemory(options);
}

export const memoryTypes = ALLOWED_TYPES;
