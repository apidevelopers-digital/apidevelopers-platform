import { createAuthorizationDecision } from "@apidevelopers/contracts";
import { randomUUID } from "node:crypto";

export function createGatewayAuthorizationService({
  policyVersion = "gateway-authz-v1",
  idFactory = randomUUID,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof idFactory !== "function") throw new TypeError("idFactory must be a function");
  if (typeof now !== "function") throw new TypeError("now must be a function");

  return Object.freeze({
    decide({ identity, action, resource, requiredScopes = [] } = {}) {
      const principal = identity?.principal ?? {};
      const scopes = Array.isArray(principal.scopes) ? principal.scopes : [];
      const missingScopes = requiredScopes.filter((scope) => !scopes.includes(scope));
      const effect = missingScopes.length === 0 ? "allow" : "deny";
      return createAuthorizationDecision({
        decisionId: idFactory(),
        subjectId: principal.id,
        tenantId: principal.tenantId,
        action,
        resource,
        effect,
        policyVersion,
        reasonCodes: effect === "allow"
          ? ["required_scopes_satisfied"]
          : missingScopes.map((scope) => `missing_scope:${scope}`),
        humanApprovalRequired: false,
        decidedAt: now(),
      });
    },
  });
}