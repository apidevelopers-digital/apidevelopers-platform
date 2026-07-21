function clone(value) {
  return value == null ? value : structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function assertIndex(index) {
  if (!index || typeof index !== "object" || Array.isArray(index)) {
    throw new TypeError("capability index must be an object");
  }
  if (!Array.isArray(index.capabilities)) {
    throw new TypeError("capability index capabilities must be an array");
  }
}

export function resolveCapabilityPlan(index, requestedIds = []) {
  assertIndex(index);
  if (!Array.isArray(requestedIds)) {
    throw new TypeError("requestedIds must be an array");
  }

  const byId = new Map();
  for (const capability of index.capabilities) {
    if (!capability || typeof capability !== "object" || Array.isArray(capability)) {
      throw new TypeError("capability entries must be objects");
    }
    if (typeof capability.id !== "string" || capability.id.trim() === "") {
      throw new TypeError("capability.id must be a non-empty string");
    }
    if (!Array.isArray(capability.dependsOn)) {
      throw new TypeError(`${capability.id}.dependsOn must be an array`);
    }
    if (byId.has(capability.id)) {
      throw new Error(`duplicate capability id: ${capability.id}`);
    }
    byId.set(capability.id, capability);
  }

  const roots = requestedIds.length > 0
    ? [...new Set(requestedIds)]
    : [...byId.keys()].sort();

  const visiting = new Set();
  const visited = new Set();
  const ordered = [];

  function visit(id, trail = []) {
    const capability = byId.get(id);
    if (!capability) {
      throw new Error(`unknown capability: ${id}`);
    }
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      const cycleStart = trail.indexOf(id);
      const cycle = [...trail.slice(cycleStart), id].join(" -> ");
      throw new Error(`capability dependency cycle: ${cycle}`);
    }

    visiting.add(id);
    const nextTrail = [...trail, id];
    for (const dependency of [...capability.dependsOn].sort()) {
      visit(dependency, nextTrail);
    }
    visiting.delete(id);
    visited.add(id);
    ordered.push(clone(capability));
  }

  for (const id of roots) visit(id);

  return deepFreeze({
    schemaVersion: 1,
    requested: [...roots],
    count: ordered.length,
    capabilities: ordered,
  });
}
