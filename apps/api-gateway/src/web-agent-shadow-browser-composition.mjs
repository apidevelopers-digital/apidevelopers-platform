import { createWebAgentBrowserComposition } from "./web-agent-browser-composition.mjs";
import { createWebAgentShadowConversationService } from "./web-agent-shadow-client.mjs";

export function createWebAgentShadowBrowserComposition({
  shadowRuntime,
  ...browserDependencies
} = {}) {
  if (!shadowRuntime || typeof shadowRuntime !== "object" || Array.isArray(shadowRuntime)) {
    throw new TypeError("shadowRuntime must be an object");
  }

  const conversationService = createWebAgentShadowConversationService(shadowRuntime);
  const browser = createWebAgentBrowserComposition({
    ...browserDependencies,
    conversationService,
  });

  return Object.freeze({
    ...browser,
    conversationService,
  });
}
