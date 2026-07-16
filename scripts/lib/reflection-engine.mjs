function clone(value) {
  return value == null ? value : structuredClone(value);
}

function prefixOf(id) {
  return typeof id === "string" ? id.split(".")[0] : "";
}

function indexSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("snapshot must be an object");
  }

  const nodes = Array.isArray(snapshot.nodes) ? snapshot.nodes : [];
  const relations = Array.isArray(snapshot.relations) ? snapshot.relations : [];
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

  return { nodes, incoming, outgoing };
}

function otherEnd(relation, id) {
  return relation.from === id ? relation.to : relation.from;
}

function finding(ruleId, severity, subject, title, recommendation) {
  return { ruleId, severity, subject, title, recommendation };
}

export class ReflectionEngine {
  constructor({ clock = () => new Date().toISOString() } = {}) {
    if (typeof clock !== "function") throw new Error("clock must be a function");
    this.clock = clock;
  }

  analyze(snapshot, { scope = "platform", requestedBy = "system" } = {}) {
    const { nodes, incoming, outgoing } = indexSnapshot(snapshot);
    const findings = [];

    for (const node of nodes) {
      if (!node?.id) continue;
      const prefix = prefixOf(node.id);
      const relations = [
        ...(incoming.get(node.id) ?? []),
        ...(outgoing.get(node.id) ?? []),
      ];

      if (!["institution", "person"].includes(prefix) && relations.length === 0) {
        findings.push(
          finding(
            "REF-001",
            "medium",
            node.id,
            "Orphan node",
            "Connect the node to its origin, owner, capability, solution, organization or evidence."
          )
        );
      }

      if (prefix === "capability") {
        const hasAsset = relations.some((r) => prefixOf(otherEnd(r, node.id)) === "asset");
        if (!hasAsset) {
          findings.push(
            finding(
              "REF-002",
              node.status === "active" ? "high" : "low",
              node.id,
              "Capability without Asset",
              "Create or link an Asset, or return the Capability to planned status."
            )
          );
        }
      }

      if (prefix === "asset") {
        const hasEvidence = relations.some((r) => prefixOf(otherEnd(r, node.id)) === "evidence");
        if (!hasEvidence) {
          findings.push(
            finding(
              "REF-003",
              ["managed", "certified", "official"].includes(node.promotionStage) ? "high" : "medium",
              node.id,
              "Asset without Evidence",
              "Attach test, runtime, security, documentation or approval Evidence before promotion."
            )
          );
        }
      }

      if (["org", "organization"].includes(prefix) && (!node.status || node.status === "active")) {
        const hasSolution = relations.some((r) => prefixOf(otherEnd(r, node.id)) === "solution");
        if (!hasSolution) {
          findings.push(
            finding(
              "REF-004",
              "medium",
              node.id,
              "Active Organization without Solution",
              "Declare a Solution composition instead of adding Organization-specific logic to the Kernel."
            )
          );
        }
      }
    }

    const counts = findings.reduce(
      (acc, item) => {
        acc.total += 1;
        acc[item.severity] += 1;
        return acc;
      },
      { total: 0, high: 0, medium: 0, low: 0 }
    );

    return {
      reflectionId: `reflection.${this.clock().replace(/[-:.TZ]/g, "").toLowerCase()}`,
      generatedAt: this.clock(),
      requestedBy,
      scope,
      mode: "advisory",
      mutationAllowed: false,
      summary: {
        status: counts.high ? "attention" : counts.medium ? "review" : "healthy",
        counts,
      },
      findings: clone(findings),
    };
  }
}

export const reflectionRules = Object.freeze({
  REF001: "orphan nodes",
  REF002: "capabilities without assets",
  REF003: "assets without evidence",
  REF004: "organizations without solutions",
});
