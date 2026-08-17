import {
  createWebAgentConversationRequest,
  createWebAgentConversationResponse,
  createWebAgentInternationalEnvelope,
} from "@apidevelopers/contracts";

import { assertAuthorizedAgentForProduct } from "./web-agent-product-binding.mjs";

const SENSITIVE_KEYS = new Set([
  "apikey",
  "authorization",
  "password",
  "secret",
  "token",
  "accesstoken",
  "refreshtoken",
  "credential",
  "bearer",
  "xunicoapikey",
]);

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

function assertNoBrowserSecrets(value, path = "body") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.replace(/[-_]/g, "").toLowerCase();
    if (SENSITIVE_KEYS.has(normalized)) {
      throw new Error(`${path}.${key} is forbidden in a browser request`);
    }
    assertNoBrowserSecrets(child, `${path}.${key}`);
  }
}

function toPublicDenial(decision) {
  if (!decision || typeof decision !== "object") {
    return { allowed: false, reason: "access_denied" };
  }
  return {
    allowed: false,
    reason:
      typeof decision.reason === "string"
        ? decision.reason
        : "access_denied",
  };
}

function publicLocaleResolution(resolution = {})  {
  return Object.freeze({
    requestedLocaleSupported: Boolean(resolution.requestedLocaleSupported),
    localeSource:
      resolution.localeSource === "user_preference"
        ?" user_preference"
        : "tenant_default",
  });
}

export function createWebAgentConversationBoundary({
  authenticator,
  saasAccess,
  internationalContextResolver,
  conversationService,
} = {}) {
  if (typeof authenticator?.authenticate !== "function") {
    throw new TypeError("authenticator.authenticate must be a function");
  }
  if (typeof saasAccess?.evaluateAccess !== "function") {
    throw new TypeError("saasAccess.evaluateAccess must be a function");
  }
  if (typeof internationalContextResolver?.resolve !== "function") {
    throw new TypeError("internationalContextResolver.resolve must be a function");
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
        assertNoBrowserSecrets(input);
      } catch (error) {
        return jsonResponse(400, {
          error: "invalid_request",
          message: error.message,
        });
      }

      let accessGrantId;
      let workspaceId;
      let productId;
      try {
        accessGrantId = requireText(input.accessGrantId, "body.accessGrantId");
        workspaceId = requireText(input.workspaceId, "body.workspaceId");
        productId = requireText(input.productId, "body.productId");
      } catch (error) {
        return jsonResponse(400, {
          error: "access_context_required",
          message: error.message,
        });
      }

      const accessDecision = await saasAccess.evaluateAccess({identity, accessGrantId, tenantId, workspaceId, productId});
      if (!accessDecision?.allowed) {
        return jsonResponse(403, toPublicDenial(accessDecision));
      }

      let agentId;
      try {
        agentId = requireText(input.agentId, "body.agentId");
        assertAuthorizedAgentForProduct({ productId, agentId });
      } catch (error) {
        if (error?.code === "product_agent_mismatch") {
          return jsonResponse(403, { error: "product_agent_mismatch" });
        }
        return jsonResponse(400, { error: "invalid_conversation_request", message: error.message });
      }

      let international;
      try {
        international = await internationalContextResolver.resolve({
          identity,
          accessGrantId,
          workspaceId,
          productId,
          requestedLocale: input.locale,
        });
      } catch {
        return jsonResponse(503, { error: "international_context_unavailable" });
      }

      let request;
      let envelope;
      try {
        request = createWebAgentConversationRequest({
          agentId,
          conversationId: input.conversationId,
          sessionId: input.sessionId,
          principalId,
          tenantId,
          workspaceId,
          requestId: input.requestId,
          correlationId: input.correlationId,
          locale: international.context.locale,
          parts: input.parts,
          capabilities: input.capabilities,
        });
        envelope = createWebAgentInternationalEnvelope({
          conversation: request,
          internationalContext: international.context,
        });
      } catch (error) {
        return jsonResponse(400, { error: "invalid_conversation_request", message: error.message });
      }

      const raw = await conversationService.handle(envelope);
      let result;
      try {
        result = createWebAgentConversationResponse({
          requestId: request.requestId,
          correlationId: request.correlationId,
          conversationId: request.conversationId,
          agentId: request.agent.id,
          runtime: request.agent.runtime,
          parts: raw?.parts,
          memoryRead: raw?.memoryRead,
          memoryWriteProposed: raw?.memoryWriteProposed,
          toolProposals: raw?.toolProposals,
          externalExecutionProposed: raw?.externalExecutionProposed,
        });
      } catch {
        return jsonResponse(502, { error: "invalid_cognitive_response" });
      }

      return jsonResponse(200, {
        ...result,
        internationalContext: international.context,
        localeResolution: publicLocaleResolution(international.resolution),
      });
    },
  });
}
