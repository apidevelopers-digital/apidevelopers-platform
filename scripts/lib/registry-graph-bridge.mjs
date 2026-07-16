function clone(value) {
  return value == null ? value : structuredClone(value);
}

function assertRegistry(registry) {
  if (!registry || typeof registry !== "object") {
    throw new Error("registry must be an object");
  }
  for (const method of ["list", "validate"]) {
    if (typeof registry[method] !== "function") {
      throw new Error(`registry must implement ${method}()`);
    }
  }
}

function assertGraph(graph) {
  if (!graph || typeof graph !== "object") {
    throw new Error("graph must be an object");
  }
  for (const method of ["getNode", "registerNode", "upsertNode", "getRelations", "relate"]) {
    if (typeof graph[method] !== "function") {
      throw new Error(`graph must implement ${method}()`);
    }
  }
}

function relationExists(graph, from, type, to) {
  return graph
    .getRelations(from, { direction: "out", type })
    .some((relation) => relation.from === from && relation.type === type && relation.to === to);
}

function ensureNode(graph, node, actor) {
  const existing = graph.getNode(node.id);
  if (!existing) {
    return { operation: "created", node: graph.registerNode(node, { actor }) };
  }

  const comparableExisting = {
    ...existing,
    createdAt: undefined,
    updatedAt: undefined,
    version: undefined,
  };
  const comparableIncoming = {
    ...node,
    createdAt: undefined,
    updatedAt: undefined,
    version: undefined,
  };

  if (JSON.stringify(comparableExisting) === JSON.stringify(comparableIncoming)) {
    return { operation: "unchanged", node: clone(existing) };
  }

  return { operation: "updated", node: graph.upsertNode(node, { actor }) };
}

function ensureRelation(graph, relation, actor) {
  if (relationExists(graph, relation.from, relation.type, relation.to)) {
    return { operation: "unchanged", relation: clone(relation) };
  }

  return { operation: "created", relation: graph.relate(relation, { actor }) };
}

function capabilityNodeId(capability) {
  return capability.startsWith("capability.") ? capability : `capability.${capability}`;
}

function contractNodeId(contract) {
  return contract.startsWith("contract.") ? contract : `contract.${contract}`;
}

function policyNodeId(policy) {
  return policy.startsWith("policy.") ? policy : `policy.${policy}`;
}

export class RegistryGraphBridge {
  constructor(registry, graph, { actor = "registry-graph-bridge" } = {}) {
    assertRegistry(registry);
    assertGraph(graph);
    this.registry = registry;
    this.graph = graph;
    this.actor = actor;
  }

  sync({ status, kind } = {}) {
    const validation = this.registry.validate();
    if (!validation.ok) {
      const error = new Error("registry validation failed");
      error.code = "REGISTRY_VALIDATION_FAILED";
      error.findings = validation.findings;
      throw error;
    }

    const report = {
      mode: "synchronize",
      mutationAllowed: true,
      actor: this.actor,
      created: { nodes: 0, relations: 0 },
      updated: { nodes: 0 },
      unchanged: { nodes: 0, relations: 0 },
      entries: [],
    };

    for (const entry of this.registry.list({ status, kind })) {
      const entryReport = this.#syncEntry(entry);
      report.entries.push(entryReport);

      for (const item of entryReport.nodes) {
        report[item.operation === "created" ? "created" : item.operation === "updated" ? "updated" : "unchanged"].nodes += 1;
      }
      for (const item of entryReport.relations) {
        report[item.operation === "created" ? "created" : "unchanged"].relations += 1;
      }
    }

    return report;
  }

  #syncEntry(entry) {
    const nodes = [];
    const relations = [];

    nodes.push(
      ensureNode(
        this.graph,
        {
          id: entry.id,
          kind: entry.kind,
          version: entry.version,
          status: entry.status,
          owner: entry.owner,
          metadata: clone(entry.metadata),
          source: "capability-registry",
        },
        this.actor,
      ),
    );

    for (const capability of entry.capabilities) {
      const id = capabilityNodeId(capability);
      nodes.push(
        ensureNode(this.graph, { id, kind: "capability", status: "active", metadata: { discoveredFromRegistry: true }, source: "capability-registry" }, this.actor),
      );
      relations.push(
        ensureRelation(this.graph, { type: "implements", from: entry.id, to: id, metadata: { source: "capability-registry" } }, this.actor),
      );
    }

    for (const contract of entry.contracts) {
      const id = contractNodeId(contract);
      nodes.push(
        ensureNode(this.graph, { id, kind: "contract", status: "active", metadata: { discoveredFromRegistry: true }, source: "capability-registry" }, this.actor),
      );
      relations.push(
        ensureRelation(this.graph, { type: "references", from: entry.id, to: id, metadata: { source: "capability-registry" } }, this.actor),
      );
    }

    for (const policy of entry.policies) {
      const id = policyNodeId(policy);
      nodes.push(
        ensureNode(this.graph, { id, kind: "policy", status: "active", metadata: { discoveredFromRegistry: true }, source: "capability-registry" }, this.actor),
      );
      relations.push(
        ensureRelation(this.graph, { type: "references", from: entry.id, to: id, metadata: { source: "capability-registry" } }, this.actor),
      );
    }

    for (const dependencyId of entry.dependsOn) {
      if (!this.graph.getNode(dependencyId)) {
        nodes.push(
          ensureNode(this.graph, { id: dependencyId, kind: "component", status: "planned", metadata: { placeholder: true, discoveredFromRegistry: true }, source: "capability-registry" }, this.actor),
        );
      }
      relations.push(
        ensureRelation(this.graph, { type: "depends_on", from: entry.id, to: dependencyId, metadata: { source: "capability-registry" } }, this.actor),
      );
    }

    return { entryId: entry.id, nodes, relations };
  }
}

export function createRegistryGraphBridge(registry, graph, options = {}) {
  return new RegistryGraphBridge(registry, graph, options);
}
