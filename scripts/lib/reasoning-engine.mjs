
function clone(value) {
  return value == null ? value : structuredClone(value);
}

function kindOf(node) {
  return node?.kind ?? (typeof node?.id === "string" ? node.id.split(".")[0] : "unknown");
}

function indexSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") throw new Error("snapshot must be an object");

  const nodes = Array.isArray(snapshot.nodes) ? snapshot.nodes : [];
  const relations = Array.isArray(snapshot.relations) ? snapshot.relations : [];
  const byId = new Map(nodes.filter((node) => node?.id).map((node) => [node.id, node]));
  const incoming = new Map();
  const outgoing = new Map();

  for (const node of nodes) {
    if (!node?.id) continue;
    incoming.set(node.id, []);
    outgoing.set(node.id, []);
  }

  for (const relation of relations) {
    if (!relation?.from || !relation?.to) continue;
    if (!incoming.has(relation.to)) incoming.set(relation.to, []);
    if (!outgoing.has(relation.from)) outgoing.set(relation.from, []);
    incoming.get(relation.to).push(relation);
    outgoing.get(relation.from).push(relation);
  }

  return { nodes, relations, byId, incoming, outgoing };
}

function conclusion(ruleId, severity, subject, statement, premises, recommendation) {
  return {
    ruleId,
    severity,
    subject,
    statement,
    premises: clone(premises),
    recommendation,
    confidence: 1,
    mode: "deterministic",
  };
}

function detectCycles(nodes, outgoing) {
  const findings = [];
  const visited = new Set();
  const stack = new Set();

  function visit(id, path) {
    if (stack.has(id)) {
      const start = path.indexOf(id);
      const cycle = [...path.slice(start), id];
      findings.push(
        conclusion(
          "RSN-003",
          "high",
          id,
          `Circular dependency detected: ${cycle.join(" -> ")}`,
          cycle,
          "Break the dependency cycle by introducing an explicit boundary, adapter or ownership inversion.",
        ),
      );
      return;
    }

    if (visited.has(id)) return;
    visited.add(id);
    stack.add(id);

    const dependencies = (outgoing.get(id) ?? []).filter(
      (relation) => relation.type === "depends_on",
    );

    for (const relation of dependencies) {
      visit(relation.to, [...path, id]);
    }

    stack.delete(id);
  }

  for (const node of nodes) {
    if (node?.id) visit(node.id, []);
  }

  const unique = new Map();
  for (const finding of findings) {
    const key = [...finding.premises].sort().join("|");
    if (!unique.has(key)) unique.set(key, finding);
  }
  return [...unique.values()];
}

export class ReasoningEngine {
  constructor({ clock = () => new Date().toISOString() } = {}) {
    if (typeof clock !== "function") throw new Error("clock must be a function");
    this.clock = clock;
  }

  infer(snapshot, { scope = "platform", requestedBy = "system" } = {}) {
    const { nodes, relations, byId, incoming, outgoing } = indexSnapshot(snapshot);
    const conclusions = [];

    for (const node of nodes) {
      if (!node?.id) continue;
      const kind = kindOf(node);

      if (kind === "capability" && node.status === "active") {
        const providers = (incoming.get(node.id) ?? []).filter(
          (relation) =>
            relation.type === "implements" &&
            kindOf(byId.get(relation.from)) === "component",
        );

        if (providers.length === 0) {
          conclusions.push(
            conclusion(
              "RSN-001",
              "high",
              node.id,
              "Active Capability has no implementing Component.",
              [node.id],
              "Register or activate at least one Component that implements this Capability.",
            ),
          );
        }
      }

      if (kind === "component" && node.status === "active") {
        const contracts = (outgoing.get(node.id) ?? []).filter(
          (relation) =>
            relation.type === "references" &&
            kindOf(byId.get(relation.to)) === "contract",
        );

        if (contracts.length === 0) {
          conclusions.push(
            conclusion(
              "RSN-002",
              "medium",
              node.id,
              "Active Component has no referenced Contract.",
              [node.id],
              "Attach at least one versioned Contract before promotion or external use.",
            ),
          );
        }
      }

      if (kind === "policy" && node.status === "active") {
        const targets = (outgoing.get(node.id) ?? []).filter(
          (relation) => relation.type === "applies_to",
        );

        if (targets.length === 0) {
          conclusions.push(
            conclusion(
              "RSN-004",
              "low",
              node.id,
              "Active Policy has no target.",
              [node.id],
              "Link the Policy to governed concepts or retire it.",
            ),
          );
        }
      }

      if (node.metadata?.placeholder === true) {
        conclusions.push(
          conclusion(
            "RSN-005",
            "medium",
            node.id,
            "Placeholder node remains unresolved.",
            [node.id],
            "Replace the placeholder with a registered, owned and versioned component.",
          ),
        );
      }
    }

    conclusions.push(...detectCycles(nodes, outgoing));

    const counts = conclusions.reduce(
      (acc, item) => {
        acc.total += 1;
        acc[item.severity] = (acc[item.severity] ?? 0) + 1;
        return acc;
      },
      { total: 0, high: 0, medium: 0, low: 0, info: 0 },
    );

    return {
      reasoningId: `reasoning.${this.clock().replace(/[-:.TZ]/g, "").toLowerCase()}`,
      generatedAt: this.clock(),
      requestedBy,
      scope,
      mode: "read-only",
      mutationAllowed: false,
      summary: {
        status: counts.high > 0 ? "attention" : counts.medium > 0 ? "review" : "healthy",
        counts,
      },
      conclusions: clone(conclusions),
      constraints: {
        automaticDecisionAllowed: false,
        automaticExecutionAllowed: false,
        sourceOfTruth: "institutional-knowledge-graph",
      },
    };
  }
}

export function createReasoningEngine(options = {}) {
  return new ReasoningEngine(options);
}
