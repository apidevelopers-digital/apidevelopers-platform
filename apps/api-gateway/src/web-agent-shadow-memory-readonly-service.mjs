const clean = (value, max = 800) => {
  if (typeof value !== "string") return null;
  const out = value.trim();
  return out ? out.slice(0, max) : null;
};

const list = (value, max = 8, width = 180) => {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    const normalized = clean(item, width);
    if (normalized && !out.includes(normalized)) out.push(normalized);
    if (out.length >= max) break;
  }
  return out;
};

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function minimizeWebAgentMemoryData(data = {}) {
  const source = object(data);
  const out = {};
  const summary = clean(source.summary, 700);
  const nextBestAction = clean(source.nextBestAction, 280);
  const openLoops = list(source.openLoops, 8, 160);
  const topics = list(source.topics, 8, 100);
  if (summary) out.summary = summary;
  if (nextBestAction) out.nextBestAction = nextBestAction;
  if (openLoops.length) out.openLoops = Object.freeze(openLoops);
  if (topics.length) out.topics = Object.freeze(topics);
  return Object.freeze(out);
}

function requireMethod(value, method, name) {
  if (!value || typeof value[method] !== "function") {
    throw new TypeError(`${name}.${method} must be a function`);
  }
  return value;
}

export function createWebAgentShadowMemoryReadOnlyConversationService({
  memoryProvider,
  conversationService,
} = {}) {
  requireMethod(memoryProvider, "recall", "memoryProvider");
  requireMethod(conversationService, "handle", "conversationService");

  return Object.freeze({
    kind: "web-agent-shadow-memory-readonly-service-v1",
    mode: "shadow",
    async handle(envelope) {
      const conversation = object(envelope?.conversation);
      const agent = object(conversation.agent);
      const record = await memoryProvider.recall({
        agentId: agent.id,
        tenantId: conversation.tenantId,
        workspaceId: conversation.workspaceId,
        customerRef: conversation.principalId,
      });

      const memoryContext = record
        ? Object.freeze({
            schema: "apidevelopers.web-agent-memory-context.v1",
            mode: "read_only",
            agentId: record.agentId,
            tenantId: record.tenantId,
            workspaceId: record.workspaceId,
            contactKey: record.contactKey,
            data: minimizeWebAgentMemoryData(record.data),
          })
        : null;

      const augmented = memoryContext
        ? { ...envelope, memoryContext }
        : envelope;
      return conversationService.handle(augmented);
    },
  });
}
