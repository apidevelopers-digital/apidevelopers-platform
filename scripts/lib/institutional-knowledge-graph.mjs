
const NODE_ID_PATTERN =
  /^(institution|organization|org|solution|capability|asset|evidence|decision|adr|method|research|person|agent|workflow|document|execution|contract)\.[a-z][a-z0-9.-]*$/;

const RELATION_TYPES = new Set([
  "implements",
  "uses",
  "belongs_to",
  "depends_on",
  "originated_from",
  "validated_by",
  "approved_by",
  "documents",
  "generated",
  "supersedes",
  "references",
  "contains",
]);

function assertNonEmptyString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} must be a non-empty string`);
  }
}

function assertCanonicalNodeId(id) {
  assertNonEmptyString(id, "node.id");
  if (!NODE_ID_PATTERN.test(id)) {
    throw new Error(`invalid canonical node id: ${id}`);
  }
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function normalizeTimestamp(value) {
  const timestamp = value ?? new Date().toISOString();
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    throw new Error(`invalid timestamp: ${timestamp}`);
  }
  return new Date(parsed).toISOString();
}

function relationKey({ type, from, to }) {
  return `${type}:${from}->${to}`;
}

export class InstitutionalKnowledgeGraph {
  #nodes = new Map();
  #relations = new Map();
  #timeline = [];

  constructor({ clock = () => new Date().toISOString() } = {}) {
    if (typeof clock !== "function") {
      throw new Error("clock must be a function");
    }
    this.clock = clock;
  }

  registerNode(node, { actor = "system", at } = {}) {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      throw new Error("node must be an object");
    }

    assertCanonicalNodeId(node.id);
    assertNonEmptyString(node.kind, "node.kind");

    if (this.#nodes.has(node.id)) {
      throw new Error(`node already exists: ${node.id}`);
    }

    const timestamp = normalizeTimestamp(at ?? this.clock());
    const stored = {
      ...clone(node),
      version: node.version ?? 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.#nodes.set(stored.id, stored);
    this.#appendEvent({
      type: "node.registered",
      subject: stored.id,
      actor,
      at: timestamp,
      payload: stored,
    });

    return clone(stored);
  }

  upsertNode(node, { actor = "system", at } = {}) {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      throw new Error("node must be an object");
    }

    assertCanonicalNodeId(node.id);
    assertNonEmptyString(node.kind, "node.kind");

    const existing = this.#nodes.get(node.id);
    if (!existing) {
      return this.registerNode(node, { actor, at });
    }

    const timestamp = normalizeTimestamp(at ?? this.clock());
    const stored = {
      ...existing,
      ...clone(node),
      id: existing.id,
      version: (existing.version ?? 1) + 1,
      createdAt: existing.createdAt,
      updatedAt: timestamp,
    };

    this.#nodes.set(stored.id, stored);
    this.#appendEvent({
      type: "node.updated",
      subject: stored.id,
      actor,
      at: timestamp,
      payload: {
        previousVersion: existing.version ?? 1,
        currentVersion: stored.version,
      },
    });

    return clone(stored);
  }

  getNode(id) {
    assertCanonicalNodeId(id);
    const node = this.#nodes.get(id);
    return node ? clone(node) : null;
  }

  listNodes({ kind, status } = {}) {
    return [...this.#nodes.values()]
      .filter((node) => (kind ? node.kind === kind : true))
      .filter((node) => (status ? node.status === status : true))
      .map(clone);
  }

  relate(relation, { actor = "system", at } = {}) {
    if (!relation || typeof relation !== "object" || Array.isArray(relation)) {
      throw new Error("relation must be an object");
    }

    const { type, from, to } = relation;
    assertNonEmptyString(type, "relation.type");
    assertCanonicalNodeId(from);
    assertCanonicalNodeId(to);

    if (!RELATION_TYPES.has(type)) {
      throw new Error(`unsupported relation type: ${type}`);
    }
    if (!this.#nodes.has(from)) {
      throw new Error(`source node does not exist: ${from}`);
    }
    if (!this.#nodes.has(to)) {
      throw new Error(`target node does not exist: ${to}`);
    }

    const key = relationKey({ type, from, to });
    if (this.#relations.has(key)) {
      throw new Error(`relation already exists: ${key}`);
    }

    const timestamp = normalizeTimestamp(at ?? this.clock());
    const stored = {
      id: key,
      type,
      from,
      to,
      metadata: clone(relation.metadata ?? {}),
      createdAt: timestamp,
    };

    this.#relations.set(key, stored);
    this.#appendEvent({
      type: "relation.created",
      subject: key,
      actor,
      at: timestamp,
      payload: stored,
    });

    return clone(stored);
  }

  getRelations(id, { direction = "both", type } = {}) {
    assertCanonicalNodeId(id);

    if (!["in", "out", "both"].includes(direction)) {
      throw new Error(`invalid relation direction: ${direction}`);
    }
    if (type && !RELATION_TYPES.has(type)) {
      throw new Error(`unsupported relation type: ${type}`);
    }

    return [...this.#relations.values()]
      .filter((relation) => (type ? relation.type === type : true))
      .filter((relation) => {
        if (direction === "out") return relation.from === id;
        if (direction === "in") return relation.to === id;
        return relation.from === id || relation.to === id;
      })
      .map(clone);
  }

  neighbors(id, { direction = "both", type } = {}) {
    const relations = this.getRelations(id, { direction, type });
    const neighborIds = new Set();

    for (const relation of relations) {
      if (direction === "out") neighborIds.add(relation.to);
      else if (direction === "in") neighborIds.add(relation.from);
      else neighborIds.add(relation.from === id ? relation.to : relation.from);
    }

    return [...neighborIds]
      .map((neighborId) => this.getNode(neighborId))
      .filter(Boolean);
  }

  snapshot() {
    return {
      schemaVersion: 1,
      nodes: this.listNodes(),
      relations: [...this.#relations.values()].map(clone),
      timeline: this.timeline(),
    };
  }

  timeline({ subject, type } = {}) {
    return this.#timeline
      .filter((event) => (subject ? event.subject === subject : true))
      .filter((event) => (type ? event.type === type : true))
      .map(clone);
  }

  #appendEvent(event) {
    assertNonEmptyString(event.type, "event.type");
    assertNonEmptyString(event.subject, "event.subject");
    assertNonEmptyString(event.actor, "event.actor");

    this.#timeline.push(
      Object.freeze({
        id: `event.${String(this.#timeline.length + 1).padStart(8, "0")}`,
        ...clone(event),
      }),
    );
  }
}

export const institutionalKnowledgeGraphVocabulary = Object.freeze({
  nodeIdPattern: NODE_ID_PATTERN.source,
  relationTypes: [...RELATION_TYPES],
});
