import {
  createBrowserSessionAuthenticator,
} from "@apidevelopers/auth-core/browser-session-authenticator";

import {
  createWebAgentConversationBoundary,
} from "./web-agent-conversation-boundary.mjs";
import {
  createWebAgentConversationHttpRoute,
} from "./web-agent-conversation-http.mjs";
import {
  createWebInternationalContextResolver,
} from "./web-international-context-resolver.mjs";

function requireFunction(value, name) {
  if (typeof value !== "function") {
    throw new TypeError(`${name} must be a function`);
  }
  return value;
}

function requireMethod(value, method, name) {
  if (!value || typeof value !== "object" || typeof value[method] !== "function") {
    throw new TypeError(`${name}.${method} must be a function`);
  }
  return value;
}

export function createWebAgentBrowserComposition({
  resolveSessionByHash,
  saasRuntime,
  membershipRuntime,
  tenantInternationalProfile,
  commercialContext,
  conversationService,
  cookieName,
  now,
  maxBodyBytes,
} = {}) {
  requireFunction(resolveSessionByHash, "resolveSessionByHash");
  requireMethod(saasRuntime, "getTenant", "saasRuntime");
  requireMethod(saasRuntime, "getWorkspace", "saasRuntime");
  requireMethod(membershipRuntime, "openChatSession", "membershipRuntime");
  requireMethod(tenantInternationalProfile, "resolve", "tenantInternationalProfile");
  requireMethod(commercialContext, "resolve", "commercialContext");
  requireMethod(conversationService, "handle", "conversationService");

  const authenticator = createBrowserSessionAuthenticator({
    resolveSessionByHash,
    ...(cookieName ? { cookieName } : {}),
    ...(now ? { now } : {}),
  });

  const internationalContextResolver = createWebInternationalContextResolver({
    tenantInternationalProfile,
    commercialContext,
  });

  const boundary = createWebAgentConversationBoundary({
    authenticator,
    saasRuntime,
    membershipRuntime,
    internationalContextResolver,
    conversationService,
  });

  const route = createWebAgentConversationHttpRoute({
    boundary,
    ...(maxBodyBytes ? { maxBodyBytes } : {}),
  });

  return Object.freeze({
    authenticator,
    internationalContextResolver,
    boundary,
    route,
  });
}
