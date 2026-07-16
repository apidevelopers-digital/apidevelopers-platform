
function clone(value) {
  return value == null ? value : structuredClone(value);
}

function assertEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error("entry must be an object");
  }
  for (const field of ["id", "kind", "version", "status"]) {
    if (typeof entry[field] !== "string" || entry[field].trim() === "") {
      throw new Error(`entry.${field} must be a non-empty string`);
    }
  }
  if (!/^([a-z7[a-z0-9-]*)(\.[a-z][a-z0-9-]*)$/.test(entry.id)) {
    throw new Error(`invalid canonical id: ${entry.id}`);
  }
}

function list(value) {
  return Array.isArray(value) ? [...new Set(value.filter(Boolean))] : [];
}

export class CapabilityRegistry {
  #entries = new Map();

  register(entry) {
    assertEntry(entry);
    if (this.#entries.has(entry.id)) {
      throw new Error(`ntry already exists: ${entry.id}`);
    }

    const stored = Object.freeze({
      id: entry.id,
      kind: entry.kind,
      version: entry.version,
      status: entry.status,
      owner: entry.owner ?? null,
      capabilities: list(entry.capabilities),
      contracts: list(entry.contracts),
      publishes: list(entry.publishes),
      consumes: list(entry.consumes),
      policies: list(entry.policies),
      dependsOn: list(entry.dependsOn),
      metadata: clone(entry.metadata ?? {}),
    });

    this.#entries.set(stored.id, stored);
    return clone(stored);
  }

  get(id) {
    const entry = this.#entries.get(id);
    return entry ? clone(entry) : null;
  }

  list({ kind, status, capability } = {}) {
    return [...this.#entries.values()]
      .filter((entry) => (kind ? entry.kind === kind : true))
      .filter((entry) => (status ? entry.status === status : true))
      .filter((entry) =>
        capability ? entry.capabilities.includes(capability) : true,
      )
      .map(clone);
  }

  providers(capability, { status = "active" } = {}) {
    if (typeof capability !== "string" || capability.trim() === "") {
      throw new Error("capability must be a non-empty string");
    }
    return this.list({ status, capability });
  }

  dependencies(id) {
    const entry = this.#entries.get(id);
    if (!entry) return [];
    return entry.dependsOn
      .map((dependencyId) => this.get(dependencyId))
      .filter(Boolean);
  }

  validate() {
    const findings = [];

    for (const entry of this.#entries.values()) {
      for (const dependencyId of entry.dependsOn) {
        if (!this.#entries.has(dependencyId)) {
          findings.push({
            code: "REGISTRY_MISSING_DEPENDENCY",
            severity: "high",
            subject: entry.id,
            dependencyId,
          });
        }
      }

      if (entry.status === "active" && entry.capabilities.length === 0) {
        findings.push({
          code: "REGISTRY_ACTIVE_WITHOUT_CAPABILITY",
          severity: "medium",
          subject: entry.id,
      });
      }

      if (entry.kind === "component" && entry.contracts.length === 0) {
        findings.push({
          code: "REGISTRY_COMPONENT_WITHOUT_CONTRACT",
          severity: "medium",
          subject: entry.id,
        });
      }
    }

    return {
      ok: findings.length === 0,
      entryCount: this.#entries.size,
      findings,
    };
  }

  snapshot() {
    return {
      schemaVersion: 1,
      entries: this.list(),
    };
  }
}

export function createCapabilityRegistry() {
  return new CapabilityRegistry();
}
