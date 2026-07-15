export function createConversationSession(input) {
  const {
    tenantId,
    sessionId,
    correlationId,
    channel = "unknown",
    metadata = {},
  } = input ?? {};

  if (!tenantId || !sessionId || !correlationId) {
    throw new TypeError("tenantId, sessionId and correlationId are required");
  }

  return Object.freeze({
    tenantId,
    sessionId,
    correlationId,
    channel,
    metadata: Object.freeze({ ...metadata }),
    startedAt: new Date().toISOString(),
    status: "active",
  });
}

export function createConversationTurn(input) {
  const {
    tenantId,
    sessionId,
    turnId,
    correlationId,
    role,
    content,
    metadata = {},
  } = input ?? {};

  if (!tenantId || !sessionId || !turnId || !correlationId) {
    throw new TypeError("tenantId, sessionId, turnId and correlationId are required");
  }

  if (!["user", "assistant", "system", "tool"].includes(role)) {
    throw new TypeError("role must be user, assistant, system or tool");
  }

  if (typeof content !== "string" || content.trim() === "") {
    throw new TypeError("content must be a non-empty string");
  }

  return Object.freeze({
    tenantId,
    sessionId,
    turnId,
    correlationId,
    role,
    content,
    metadata: Object.freeze({ ...metadata }),
    createdAt: new Date().toISOString(),
  });
}
