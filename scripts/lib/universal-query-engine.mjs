function clone(value) {
  return value == null ? value : structuredClone(value);
}

function assertGraph(graph) {
  if (!graph || typeof graph !== "object") {
    throw new Error("graph must be an object");
  }
  if (typeof graph.getNode !== "function" ||
      typeof graph.listNodes !== "function" ||
      typeof graph.getRelations !== "function") {
    throw new Error("graph must implement getNode, listNodes and getRelations");
  }
}

function normalizeDepth(depth) {
  if (!Number.isInteger(depth) || depth < 0 || depth > 10) {
    throw new Error("depth must be an integer between 0 and 10");
  }
  return depth;
}

export class UniversalQueryEngine {
  constructor(graph) {
    assertGraph(graph);
    this.graph = graph;
  }

  get(id) {
    return this.graph.getNode(id);
  }

  find({ kind, status, where = {} } = {}) {
    return this.graph
      .listNodes({ kind, status })
      .filter((node) =>
        Object.entries(where).every(([key, value]) => node?.[key] === value),
      )
      .map(clone);
  }

  related(id, { direction = "both", type } = {}) {
    const relations = this.graph.getRelations(id, { direction, type });

    return relations.map((relation) => {
      const neighborId = relation.from === id ? relation.to : relation.from;
      return {
        relation: clone(relation),
        node: this.graph.getNode(neighborId),
      };
    });
  }

  traverse(id, { depth = 1, direction = "both", relationTypes = [] } = {}) {
    normalizeDepth(depth);

    const nodes = new Map();
    const relations = new Map();
    const queue = [{ id, level: 0 }];
    const visited = new Set();

    while (queue.length > 0) {
      const current = queue.shift();
      if (visited.has(current.id)) continue;
      visited.add(current.id);

      const node = this.graph.getNode(current.id);
      if (!node) continue;
      nodes.set(node.id, node);

      if (current.level >= depth) continue;

      const currentRelations = this.graph.getRelations(current.id, { direction });
      for (const relation of currentRelations) {
        if (
          relationTypes.length > 0 &&
          !relationTypes.includes(relation.type)
        ) {
          continue;
        }

        relations.set(relation.id, relation);
        const neighborId =
          relation.from === current.id ? relation.to : relation.from;

        if (!visited.has(neighborId)) {
          queue.push({ id: neighborId, level: current.level + 1 });
        }
      }
    }

    return {
      root: id,
      depth,
      nodes: [...nodes.values()].map(clone),
      relations: [...relations.values()].map(clone),
    };
  }

  impact(id, { depth = 3 } = {}) {
    const subgraph = this.traverse(id, {
      depth,
      direction: "in",
      relationTypes: [
        "uses",
        "depends_on",
        "implements",
        "contains",
        "references",
        "validated_by",
        "documents",
      ],
    });

    const counts = subgraph.nodes.reduce((acc, node) => {
      const kind = node.kind ?? node.id.split(".")[0];
      acc[kind] = (acc[kind] ?? 0) + 1;
      return acc;
    }, {});

    return {
      subject: id,
      depth,
      impactedNodes: subgraph.nodes.filter((node) => node.id !== id),
      relations: subgraph.relations,
      counts,
    };
  }

  context(id, { depth = 2 } = {}) {
    const root = this.graph.getNode(id);
    if (!root) return null;

    const subgraph = this.traverse(id, { depth, direction: "both" });

    return {
      subject: clone(root),
      subgraph,
      timeline:
        typeof this.graph.timeline === "function"
          ? this.graph.timeline({ subject: id })
          : [],
    };
  }
}

export function createUniversalQueryEngine(graph) {
  return new UniversalQueryEngine(graph);
}
