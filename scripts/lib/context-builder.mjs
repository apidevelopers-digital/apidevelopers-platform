
function clone(value) {
  return value == null ? value : structuredClone(value);
}

function assertQueryEngine(queryEngine) {
  if (!queryEngine || typeof queryEngine !== "object") {
    throw new Error("queryEngine must be an object");
  }

  for (const method of ["get", "related", "context", "impact"]) {
    if (typeof queryEngine[method] !== "function") {
      throw new Error(`queryEngine must implement ${method}()`);
    }
  }
}

function normalizeDepth(depth) {
  if (!Number.isInteger(depth) || depth < 0 || depth > 5) {
    throw new Error("depth must be an integer between 0 and 5");
  }
  return depth;
}

function nodeKind(node) {
  return node?.kind ?? (typeof node?.id === "string" ? node.id.split(".")[0] : "unknown");
}

function uniqueById(items) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }

  return result;
}

export class ContextBuilder {
  constructor(queryEngine, { clock = () => new Date().toISOString() } = {}) {
    assertQueryEngine(queryEngine);

    if (typeof clock !== "function") {
      throw new Error("clock must be a function");
    }

    this.query = queryEngine;
    this.clock = clock;
  }

  build(
    rootId,
    {
      depth = 2,
      includeImpact = true,
      includeTimeline = true,
      includeEvidence = true,
      requestedBy = "system",
      purpose = "institutional-context",
    } = {},
  ) {
    normalizeDepth(depth);

    const root = this.query.get(rootId);
    if (!root) return null;

    const graphContext = this.query.context(rootId, { depth });
    const nodes = uniqueById(graphContext?.subgraph?.nodes ?? [root]);
    const relations = clone(graphContext?.subgraph?.relations ?? []);
    const timeline = includeTimeline ? clone(graphContext?.timeline ?? []) : [];

    const evidence = includeEvidence
      ? nodes.filter((node) => nodeKind(node) === "evidence")
      : [];

    const decisions = nodes.filter((node) =>
      ["decision", "adr", "method", "document"].includes(nodeKind(node)),
    );

    const organizations = nodes.filter((node) =>
      ["org", "organization"].includes(nodeKind(node)),
    );

    const capabilities = nodes.filter((node) => nodeKind(node) === "capability");
    const assets = nodes.filter((node) => nodeKind(node) === "asset");
    const solutions = nodes.filter((node) => nodeKind(node) === "solution");

    const impact = includeImpact ? this.query.impact(rootId, { depth: Math.min(depth + 1, 5) }) : null;

    return {
      contextId: `context.${this.clock().replace(/[-:.TZ]/g, "").toLowerCase()}`,
      generatedAt: this.clock(),
      requestedBy,
      purpose,
      root: clone(root),
      summary: {
        nodeCount: nodes.length,
        relationCount: relations.length,
        evidenceCount: evidence.length,
        timelineEventCount: timeline.length,
        organizationCount: organizations.length,
        capabilityCount: capabilities.length,
        assetCount: assets.length,
        solutionCount: solutions.length,
      },
      layers: {
        institutional: clone(decisions),
        capabilities: clone(capabilities),
        assets: clone(assets),
        solutions: clone(solutions),
        organizations: clone(organizations),
        evidence: clone(evidence),
        timeline,
      },
      graph: {
        nodes: clone(nodes),
        relations,
      },
      impact: clone(impact),
      constraints: {
        mode: "read-only",
        mutationAllowed: false,
        sourceOfTruth: "institutional-knowledge-graph",
      },
    };
  }

  buildPromptContext(rootId, options = {}) {
    const context = this.build(rootId, options);
    if (!context) return null;

    return {
      institution: {
        root: context.root.id,
        purpose: context.purpose,
        constraints: context.constraints,
      },
      context: {
        summary: context.summary,
        layers: context.layers,
        impact: context.impact,
      },
      provenance: {
        contextId: context.contextId,
        generatedAt: context.generatedAt,
        requestedBy: context.requestedBy,
      },
    };
  }
}

export function createContextBuilder(queryEngine, options = {}) {
  return new ContextBuilder(queryEngine, options);
}
