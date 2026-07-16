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

export class OntologyEngine {
  #concepts = new Map();
  #relations = new Map();

  constructor({ version = "0.1.0" } = {}) {
    assertString(version, "version");
    this.version = version;
  }

  defineConcept(definition) {
    assertObject(definition, "definition");
    assertString(definition.id, "definition.id");

    if (this.#concepts.has(definition.id)) {
      throw new Error(`concept already exists: ${definition.id}`);
    }

    const stored = Object.freeze({
      id: definition.id,
      title: definition.title ?? definition.id,
      description: definition.description ?? null,
      required: [...new Set(definition.required ?? [])],
      optional: [...new Set(definition.optional ?? [])],
      allowedRelations: [...new Set(definition.allowedRelations ?? [])],
      metadata: clone(definition.metadata ?? {}),
    });

    this.#concepts.set(stored.id, stored);
    return clone(stored);
  }

  defineRelation(definition) {
    assertObject(definition, "definition");
    assertString(definition.id, "definition.id");

    if (this.#relations.has(definition.id)) {
      throw new Error(`relation already exists: ${definition.id}`);
    }

    const stored = Object.freeze({
      id: definition.id,
      from: [...new Set(definition.from ?? [])],
      to: [...new Set(definition.to ?? [])],
      description: definition.description ?? null,
      metadata: clone(definition.metadata ?? {}),
    });

    this.#relations.set(stored.id, stored);
    return clone(stored);
  }

  getConcept(id) {
    const concept = this.#concepts.get(id);
    return concept ? clone(concept) : null;
  }

  getRelation(id) {
    const relation = this.#relations.get(id);
    return relation ? clone(relation) : null;
  }

  listConcepts() {
    return [...this.#concepts.values()].map(clone);
  }

  listRelations() {
    return [...this.#relations.values()].map(clone);
  }

  validateNode(node) {
    assertObject(node, "node");
    assertString(node.kind, "node.kind");

    const concept = this.#concepts.get(node.kind);
    if (!concept) {
      return {
        ok: false,
        findings: [{
          code: "ONTOLOGY_UNKNOWN_CONCEPT",
          severity: "high",
          subject: node.id ?? null,
          concept: node.kind,
        }],
      };
    }

    const findings = [];

    for (const field of concept.required) {
      if (node[field] == null || node[field] === "") {
        findings.push({
          code: "ONTOLOGY_REQUIRED_FIELD_MISSING",
          severity: "high",
          subject: node.id ?? null,
          concept: node.kind,
          field,
        });
      }
    }

    return { ok: findings.length === 0, findings };
  }

  validateRelation(relation, fromNode, toNode) {
    assertObject(relation, "relation");
    assertString(relation.type, "relation.type");
    assertObject(fromNode, "fromNode");
    assertObject(toNode, "toNode");

    const definition = this.#relations.get(relation.type);
    if (!definition) {
      return {
        ok: false,
        findings: [{
          code: "ONTOLOGY_UNKNOWN_RELATION",
          severity: "high",
          relation: relation.type,
        }],
      };
    }

    const findings = [];

    if (definition.from.length > 0 && !definition.from.includes(fromNode.kind)) {
      findings.push({
        code: "ONTOLOGY_INVALID_RELATION_SOURCE",
        severity: "high",
        relation: relation.type,
        sourceKind: fromNode.kind,
      });
    }

    if (definition.to.length > 0 && !definition.to.includes(toNode.kind)) {
      findings.push({
        code: "ONTOLOGY_INVALID_RELATION_TARGET",
        severity: "high",
        relation: relation.type,
        targetKind: toNode.kind,
      });
    }

    const sourceConcept = this.#concepts.get(fromNode.kind);
    if (
      sourceConcept &&
      sourceConcept.allowedRelations.length > 0 &&
      !sourceConcept.allowedRelations.includes(relation.type)
    ) {
      findings.push({
        code: "ONTOLOGY_RELATION_NOT_ALLOWED_BY_SOURCE",
        severity: "high",
        relation: relation.type,
        sourceKind: fromNode.kind,
      });
    }

    return { ok: findings.length === 0, findings };
  }

  validateGraph(snapshot) {
    assertObject(snapshot, "snapshot");
    const nodes = Array.isArray(snapshot.nodes) ? snapshot.nodes : [];
    const relations = Array.isArray(snapshot.relations) ? snapshot.relations : [];
    const byId = new Map(nodes.filter((node) => node?.id).map((node) => [node.id, node]));
    const findings = [];

    for (const node of nodes) {
      findings.push(...this.validateNode(node).findings);
    }

    for (const relation of relations) {
      const fromNode = byId.get(relation?.from);
      const toNode = byId.get(relation?.to);

      if (!fromNode || !toNode) {
        findings.push({
          code: "ONTOLOGY_RELATION_ENDPOINT_MISSING",
          severity: "high",
          relation: relation?.id ?? null,
        });
        continue;
      }

      findings.push(...this.validateRelation(relation, fromNode, toNode).findings);
    }

    return {
      ok: findings.length === 0,
      ontologyVersion: this.version,
      nodeCount: nodes.length,
      relationCount: relations.length,
      findings,
    };
  }

  snapshot() {
    return {
      schemaVersion: 1,
      ontologyVersion: this.version,
      concepts: this.listConcepts(),
      relations: this.listRelations(),
    };
  }
}

export function createDefaultOntology() {
  const ontology = new OntologyEngine({ version: "0.1.0" });

  for (const concept of [
    ["component", ["id", "kind", "version", "status"], ["implements", "references", "depends_on"]],
    ["capability", ["id", "kind", "status"], ["implemented_by", "references"]],
    ["contract", ["id", "kind", "status"], ["referenced_by"]],
    ["policy", ["id", "kind", "status"], ["applies_to"]],
    ["organization", ["id", "kind", "status"], ["uses", "belongs_to"]],
    ["solution", ["id", "kind", "status"], ["contains", "uses"]],
    ["evidence", ["id", "kind", "status"], ["validates", "references"]],
    ["decision", ["id", "kind", "status"], ["references", "approved_by"]],
  ]) {
    ontology.defineConcept({
      id: concept[0],
      required: concept[1],
      allowedRelations: concept[2],
    });
  }

  for (const relation of [
    ["implements", ["component"], ["capability"]],
    ["implemented_by", ["capability"], ["component"]],
    ["references", [], []],
    ["depends_on", ["component"], ["component"]],
    ["uses", ["organization", "solution"], ["solution", "component"]],
    ["contains", ["solution"], ["component"]],
    ["validates", ["evidence"], []],
    ["approved_by", ["decision"], ["person", "agent"]],
    ["belongs_to", ["organization"], ["institution"]],
    ["applies_to", ["policy"], []],
    ["referenced_by", ["contract"], []],
  ]) {
    ontology.defineRelation({
      id: relation[0],
      from: relation[1],
      to: relation[2],
    });
  }

  return ontology;
}
