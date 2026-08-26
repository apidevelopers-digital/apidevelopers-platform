const PRODUCT_AGENT_POLICY = Object.freeze({
  "product:uni-co": Object.freeze(["uni.co"]),
  "product:nexus": Object.freeze(["nexus"]),
  "product:radar": Object.freeze(["nexus"]),
});

export function resolveAllowedAgents(productId) {
  const agents = PRODUCT_AGENT_POLICY[productId];
  return agents ? [...agents] : [];
}

export function assertProductAgentBinding({ productId, agentId }) {
  const allowed = resolveAllowedAgents(productId);
  if (!allowed.includes(agentId)) {
    const error = new Error("product_agent_mismatch");
    error.code = "product_agent_mismatch";
    error.status = 403;
    throw error;
  }
  return Object.freeze({ allowed: true, productId, agentId });
}
