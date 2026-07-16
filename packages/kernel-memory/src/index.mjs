function clone(value) {
  return value == null ? value : structuredClone(value);
}

function assertObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
}

function assertString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be a non-empty string`);
  }
}

const ALLOWED_TYPES = new Set([
  "problem",
  "plan",
  "decision",
  "execution",
  "outcome",
  "lesson",
  "evidence",
]);

export class InstitutionalMemory {
  #entries = [];
  #byId = new Map();

  constructor({ clock = () => new Date().toISOString() } = {}) {
    if (typeof clock !== "function") throw new Error("clock must be a function");
    this.clock = clock;
  }

  append(entry) {
    assertObject(entry, "entry");
    assertString(entry.id, "entry.id");
    assertString(entry.type, "entry.type");
    assertString(entry.subject, "entry.subject");
    assertString(entry.cycleId, "entry.cycleId");

    if (!ALLOWED_TYPES.has(entry.type)) {
      throw new Error(`unsupported memory type: ${entry.type}`);
    }
    if (this.#byId.has(entry.id)) {
      throw new Error(`memory entry already exists: ${entry.id}`);
    }

    const stored = Object.freeze({
      id: entry.id,
      type: entry.type,
      subject: entry.subject,
      cycleId: entry.cycleId,
      status: entry.status ?? "recorded",
      refs: Array.isArray(entry.refs) ? [...new Set(entry.refs.filter(Boolean))] : [],
      evidence: Array.isArray(entry.evidence) ? clone(entry.evidence) : [],
      data: clone(entry.data ?? {}),
      recordedBy: entry.recordedBy ?? "system",
      recordedAt: entry.recordedAt ?? this.clock(),
      schemaVersion: 1,
    });

    this.#entries.push(stored);
    this.#byId.set(stored.id, stored);
    return clone(stored);
  }

  get(id) {
    const entry = this.#byId.get(id);
    return entry ? clone(entry) : null;
  }

  list({ cycleId, subject, type, status } = {}) {
    return this.#entries
      .filter((entry) => (cycleId ? entry.cycleId === cycleId : true))
      .filter((entry) => (subject ? entry.subject === subject : true))
      .filter((entry) => (type ? entry.type === type : true))
      .filter((entry) => (status ? entry.status === status : true))
      .map(clone);
  }

  cycle(cycleId) {
    assertString(cycleId, "cycleId");
    const entries = this.list({ cycleId });
    return {
      cycleId,
      entries,
      summary: entries.reduce(
        (acc, entry) => {
          acc.total += 1;
          acc.byType[entry.type] = (acc.byType[entry.type] ?? 0) + 1;
          return acc;
        },
        { total: 0, byType: {} },
      ),
    };
  }

  lessons({ subject, cycleId } = {}) {
    return this.list({ subject, cycleId, type: "lesson" });
  }

  snapshot() {
    return {
      schemaVersion: 1,
      mode: "append-only",
      mutationAllowed: false,
      entryCount: this.#entries.length,
      entries: this.#entries.map(clone),
    };
  }
}

export function createInstitutionalMemory(options = {}) {
  return new InstitutionalMemory(options);
}

export const memoryTypes = Object.freeze([...ALLOWED_TYPES]);
