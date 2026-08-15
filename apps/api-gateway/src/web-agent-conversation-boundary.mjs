import { createWebAgentConversationRequest } from "@apidevelopers/contracts";

function jsonResponse(status, payload) {
  return Object.freeze({ status, payload: structuredClone(payload) });
}

function requireObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value;
}

function requireText(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function toPublicDenial(decision) {
  if (!decision || typeof decision !== "object") return { allowed: false, reason: "access_denied" };
  return {
    allowed: false,
    reason: typeof decision.reason === "string" ? decision.reason : "access_denied",
  };
}

export function createWebAgentConversationBoundary({
  authenticator,
  saasAccess,
  conversationService,
} = {}) {
  if (typeof authenticator?.authenticate !== "function") {
    throw new TypeError("authenticator.authenticate must be a function");
  }
  if (typeof saasAccess?.evaluateAccess !== "function") {
    throw new TypeError("saasAccess.evaluateAccess must be a function");
  }
  if (typeof conversationService?.handle !== "function") {
    throw new TypeError("conversationService.handle must be a function");
  }

  return Object.freeze({
    async handle({ headers = {}, body } = {}) {
      const identity = await authenticator.authenticate(headers);
      if (!identity) return jsonResponse(401, { error: "unauthorized" });

      const principalId = identity?.principal?.id;
      const tenantId = identity?.principal?.tenantId;
      if (!principalId || !tenantId) {
        return jsonResponse(403, { error: "identity_context_unavailable" });
      }

      let input;
      try {
        input = requireObject(body, "body");
      } catch (error) {
        return jsonResponse(400, { error: "invalid_request", message: error.message });
      }

      let accessGrantId;
      let workspaceId;
      let productId;
      try {
        accessGrantId = requireText(input.accessGrantId, "body.accessGrantId");
        workspaceId = requireText(input.workspaceId, "body.workspaceId");
        productId = requireText(input.productId, "body.productId");
      } catch (error) {
        return jsonResponse(400, { error: "access_context_required", message: error.message });
      }

      const accessDecision = await saasAccess.evaluateAccess({
        identity,
        accessGrantId,
        tenantId,
        workspaceId,
        productId,
      });
      if (!accessDecision?.allowed) {
        return jsonResponse(403, toPublicDenial(accessDecision));
      }

      let request;
      try {
        request = createWebAgentConversationRequest({
          agentId: input.agentId,
          conversationId: input.conversationId,
          sessionId: input.sessionId,
          principalId,
          tenantId,
          workspaceId,
          requestId: input.requestId,
          correlationId: input.correlationId,
          locale: input.locale,
          parts: input.parts,
          capabilities: input.capabilities,
        });
      } catch (error) {
        return jsonResponse(400, { error: "invalid_conversation_request", message: error.message });
      }

      const result = await conversationService.handle(request);
      return jsonResponse(200, {
        requestId: request.requestId,
        correlationId: request.correlationId,
        conversationId: request.conversationId,
        agent: request.agent,
        result,
      });
    },
  });
}
