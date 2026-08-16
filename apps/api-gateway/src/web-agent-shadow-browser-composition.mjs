import { createWebAgentBrowserComposition } from "./web-agent-browser-composition.mjs";
import { createWebAgentShadowConversationService } from "./web-agent-shadow-client.mjs";
import { createWebAgentShadowMemoryReadOnlyConversationService } from "./web-agent-shadow-memory-readonly-service.mjs";

export function createWebAgentShadowBrowserComposition({
  shadowRuntime,
  memoryProvider,
  ...browserDependencies
} = {}) {
  if (!shadowRuntime || typeof shadowRuntime !== "object" || Array.isArray(shadowRuntime)) {
    throw new TypeError("shadowRuntime must be an object");
  }

  const baseConversationService = createWebAgentShadowConversationService(shadowRuntime);
  const conversationService = memoryProvider
    ? createWebAgentShadowMemoryReadOnlyConversationService({
        memoryProvider,
        conversationService: baseConversationService,
      })
    : baseConversationService;

  const browser = createWebAgentBrowserComposition({
    ...browserDependencies,
    conversationService,
  });

  return Object.freeze({
    ...browser,
    conversationService,
  });
}
