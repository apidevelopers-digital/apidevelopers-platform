import { getTool } from "../tools.mjs";
import { assertAutonomousAllowed } from "../risk-policy.mjs";

const pending = (name, input = {}) => ({
  ok: false,
  pending: true,
  tool: getTool(name),
  reason: "Provider not wired to ADA Gateway runtime yet.",
  input
});

const approvalRequired = (name, input = {}) => ({
  ok: false,
  approval_required: true,
  tool: getTool(name),
  reason: "Mutation must pass through ADA Gateway dry-run and explicit Igor approval.",
  input
});

export function createReadOnlyAdapter(namespace, provider = {}) {
  return Object.freeze({
    namespace,
    async call(toolName, input = {}) {
      const tool = getTool(toolName);
      assertAutonomousAllowed(tool);
      if (provider?.call) return provider.call(toolName, input);
      return pending(toolName, input);
    }
  });
}

export const mutationRequest = approvalRequired;
