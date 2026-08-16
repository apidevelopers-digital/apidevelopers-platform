import {
  assertWebAgentConversationRequest,
} from "./web-agent-conversation.mjs";
import {
  assertWebInternationalContext,
} from "./web-international-context.mjs";

const VERSION = 1;

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

function clone(value) {
  return structuredClone(value);
}

export const webAgentInternationalEnvelopeVersion = VERSION;

export function assertWebAgentInternationalEnvelope(
  value,
  name = "webAgentInternationalEnvelope",
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  if (value.schemaVersion !== VERSION) {
    throw new TypeError(`${name}.schemaVersion must be ${VERSION}`);
  }

  assertWebAgentConversationRequest(value.conversation, `${name}.conversation`);
  assertWebInternationalContext(value.internationalContext, `${name}.internationalContext`);

  if (value.conversation.locale !== value.internationalContext.locale) {
    throw new Error(`${name} locale mismatch`);
  }

  return value;
}

export function createWebAgentInternationalEnvelope({
  conversation,
  internationalContext,
} = {}) {
  assertWebAgentConversationRequest(conversation, "conversation");
  assertWebInternationalContext(internationalContext, "internationalContext");

  const envelope = {
    schemaVersion: VERSION,
    conversation: clone(conversation),
    internationalContext: clone(internationalContext),
  };

  assertWebAgentInternationalEnvelope(envelope);
  return freeze(envelope);
}
