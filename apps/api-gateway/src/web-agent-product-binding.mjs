import { assertProductAgentBinding } from "./product-agent-policy.mjs";

export function assertAuthorizedAgentForProduct({
  productId,
  agentId,
} = {}) {
  return assertProductAgentBinding({productId, agentId});
}
