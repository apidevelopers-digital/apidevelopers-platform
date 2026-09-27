const freeze = (value) => Object.freeze(value);

export const MITRA_MCP_V1_VERSION = "1.0.0-draft";

export const MITRA_MCP_V1_SCOPES = freeze({
  STATUS_READ: "mitra:status:read",
  CAPABILITIES_READ: "mitra:capabilities:read",
  JURISPRUDENCIA_READ: "mitra:jurisprudencia:read",
  FONTES_READ: "mitra:fontes:read",
  PROCESSOS_READ: "mitra:processos:read",
  CASOS_READ: "mitra:casos:read",
  DOCUMENTOS_READ: "mitra:documentos:read",
  ANALISE_RUN: "mitra:analise:run",
  MINUTAS_GENERATE: "mitra:minutas:generate",
  VERITAS_RUN: "mitra:veritas:run",
});

export const MITRA_MCP_V1_BACKENDS = freeze({
  ADA_GATEWAY: "ada-gateway",
  LEX_LEGAL_API: "lex-legal-api",
  MITRA_LEGAL_ORCHESTRATOR: "mitra-legal-orchestrator",
  PUBLIC_PLATFORM: "mitra-public-platform",
});

export const MITRA_MCP_V1_SAFETY = freeze({
  readOnlyFirst: true,
  secretsNeverReturned: true,
  noAutonomousLegalAct: true,
  humanReviewRequiredForDrafts: true,
  officialSourcesPreferred: true,
  noParallelJurisprudenceBackend: true,
});

const schema = (definition) => freeze(definition);

const tool = (definition) => freeze({
  risk: "R1_READONLY",
  mutatesState: false,
  destructive: false,
  secretsReturned: false,
  humanReviewRequired: false,
  ...definition,
});

export const MITRA_MCP_V1_TOOLS = freeze([
  tool({
    name: "mitra.status",
    title: "Mitra status",
    description: "Confirma disponibilidade do MCP Mitra, tenant e gateway.",
    backend: MITRA_MCP_V1_BACKENDS.ADA_GATEWAY,
    requiredScope: MITRA_MCP_V1_SCOPES.STATUS_READ,
    inputSchema: schema({ type: "object", additionalProperties: false, properties: {} }),
    outputSchema: schema({
      type: "object",
      required: ["ok", "service", "tenantId", "timestamp"],
      properties: {
        ok: { type: "boolean" },
        service: { type: "string" },
        tenantId: { type: "string" },
        timestamp: { type: "string" },
      },
    }),
  }),
  tool({
    name: "mitra.capabilities",
    title: "Mitra capabilities",
    description: "Lista ferramentas e limites disponíveis para o tenant.",
    backend: MITRA_MCP_V1_BACKENDS.ADA_GATEWAY,
    requiredScope: MITRA_MCP_V1_SCOPES.CAPABILITIES_READ,
    inputSchema: schema({ type: "object", additionalProperties: false, properties: {} }),
    outputSchema: schema({
      type: "object",
      required: ["ok", "tools"],
      properties: {
        ok: { type: "boolean" },
        tools: { type: "array", items: { type: "string" } },
        limits: { type: "object" },
      },
    }),
  }),
  tool({
    name: "mitra.buscar_jurisprudencia",
    title: "Buscar jurisprudéncia",
    description: "Busca jurisprudéncia usando Lex Legal API; não inventa precedentes.",
    backend: MITRA_MCP_V1_BACKENDS.LEX_LEGAL_API,
    requiredScope: MITRA_MCP_V1_SCOPES.JURISPRUDENCIA_READ,
    inputSchema: schema({
      type: "object",
      required: ["query"],
      additionalProperties: false,
      properties: {
        query: { type: "string", minLength: 3 },
        jurisdiction: { type: "string" },
        court: { type: "string" },
        dateFrom: { type: "string" },
        dateTo: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 25, default: 10 },
      },
    }),
    outputSchema: schema({
      type: "object",
      required: ["ok", "results", "source"],
      properties: {
        ok: { type: "boolean" },
        results: { type: "array" },
        source: { type: "string" },
      },
    }),
  }),
  tool({
    name: "mitra.pesquisar_fontes_oficiais",
    title: "Pesquisar fontes oficiais",
    description: "Pesquisa legislação, LexML, Planalto, Senado, STJ ou fontes oficiais configuradas.",
    backend: MITRA_MCP_V1_BACKENDS.LEX_LEGAL_API,
    requiredScope: MITRA_MCP_V1_SCOPES.FONTES_READ,
    inputSchema: schema({
      type: "object",
      required: ["query"],
      additionalProperties: false,
      properties: {
        query: { type: "string", minLength: 3 },
        source: { enum: ["lexml", "planalto", "senado", "stj", "all"] },
        limit: { type: "integer", minimum: 1, maximum: 25, default: 10 },
      },
    }),
    outputSchema: schema({
      type: "object",
      required: ["ok", "results"],
      properties: {
        ok: { type: "boolean" },
        results: { type: "array" },
      },
    }),
  }),
  tool({
    name: "mitra.buscar_processo",
    title: "Buscar processo",
    description: "Consulta metadados públicos de processo quando fonte autorizada estiver configurada.",
    backend: MITRA_MCP_V1_BACKENDS.LEX_LEGAL_API,
    requiredScope: MITRA_MCP_V1_SCOPES.PROCESSOS_READ,
    inputSchema: schema({
      type: "object",
      required: ["numeroCnj"],
      additionalProperties: false,
      properties: {
        numeroCnj: { type: "string", minLength: 10 },
      },
    }),
    outputSchema: schema({
      type: "object",
      required: ["ok", "numeroCnj", "metadata", "source"],
      properties: {
        ok: { type: "boolean" },
        numeroCnj: { type: "string" },
        metadata: { type: "object" },
        source: { type: "string" },
      },
    }),
  }),
  tool({
    name: "mitra.contexto_cliente",
    title: "Contexto do cliente",
    description: "Recupera contexto autorizado de cliente/caso.",
    backend: MITRA_MCP_V1_BACKENDS.MITRA_LEGAL_ORCHESTRATOR,
    requiredScope: MITRA_MCP_V1_SCOPES.CASOS_READ,
    inputSchema: schema({
      type: "object",
      additionalProperties: false,
      properties: {
        clientId: { type: "string" },
        caseId: { type: "string" },
      },
    }),
    outputSchema: schema({
      type: "object",
      required: ["ok", "client", "case", "documents"],
      properties: {
        ok: { type: "boolean" },
        client: { type: "object" },
        case: { type: "object" },
        documents: { type: "array" },
      },
    }),
  }),
  tool({
    name: "mitra.analisar_caso",
    title: "Analisar caso",
    description: "Estrutura fatos, pedidos, provas, riscos e próximas perguntas.",
    backend: MITRA_MCP_V1_BACKENDS.MITRA_LEGAL_ORCHESTRATOR,
    requiredScope: MITRA_MCP_V1_SCOPES.ANALISE_RUN,
    risk: "R2_ASSISTED_ANALYSIS",
    inputSchema: schema({
      type: "object",
      additionalProperties: false,
      properties: {
        caseId: { type: "string" },
        facts: { type: "string" },
        documents: { type: "array", items: { type: "string" } },
        objective: { type: "string" },
      },
    }),
    outputSchema: schema({
      type: "object",
      required: ["ok", "facts", "issues", "risks", "questions", "needsHumanReview"],
      properties: {
        ok: { type: "boolean" },
        facts: { type: "array" },
        issues: { type: "array" },
        risks: { type: "array" },
        questions: { type: "array" },
        needsHumanReview: { type: "boolean" },
      },
    }),
    humanReviewRequired: true,
  }),
  tool({
    name: "mitra.analisar_documento",
    title: "Analisar documento",
    description: "Analisa documento jurídico enviado ou registrado.",
    backend: MITRA_MCP_V1_BACKENDS.MITRA_LEGAL_ORCHESTRATOR,
    requiredScope: MITRA_MCP_V1_SCOPES.DOCUMENTOS_READ,
    risk: "R2_ASSISTED_ANALYSIS",
    inputSchema: schema({
      type: "object",
      additionalProperties: false,
      properties: {
        documentId: { type: "string" },
        text: { type: "string" },
        objective: { type: "string" },
      },
    }),
    outputSchema: schema({
      type: "object",
      required: ["ok", "summary", "points", "risks", "needsHumanReview"],
      properties: {
        ok: { type: "boolean" },
        summary: { type: "string" },
        points: { type: "array" },
        risks: { type: "array" },
        needsHumanReview: { type: "boolean" },
      },
    }),
    humanReviewRequired: true,
  }),
  tool({
    name: "mitra.gerar_tese",
    title: "Gerar tese assistida",
    description: "Gera tese assistida com base em fatos, fontes e precedentes.",
    backend: MITRA_MCP_V1_BACKENDS.MITRA_LEGAL_ORCHESTRATOR,
    requiredScope: MITRA_MCP_V1_SCOPES.ANALISE_RUN,
    risk: "R2_ASSISTED_ANALYSIS",
    inputSchema: schema({
      type: "object",
      required: ["facts", "objective"],
      additionalProperties: false,
      properties: {
        caseId: { type: "string" },
        facts: { type: "string" },
        sources: { type: "array", items: { type: "string" } },
        objective: { type: "string" },
      },
    }),
    outputSchema: schema({
      type: "object",
      required: ["ok", "thesis", "sourcesUsed", "warnings", "needsHumanReview"],
      properties: {
        ok: { type: "boolean" },
        thesis: { type: "string" },
        sourcesUsed: { type: "array" },
        warnings: { type: "array" },
        needsHumanReview: { type: "boolean" },
      },
    }),
    humanReviewRequired: true,
  }),
  tool({
    name: "mitra.gerar_minuta",
    title: "Gerar minuta assistida",
    description: "Gera minuta marcada como rascunho sujeito a revisão humana.",
    backend: MITRA_MCP_V1_BACKENDS.MITRA_LEGAL_ORCHESTRATOR,
    requiredScope: MITRA_MCP_V1_SCOPES.MINUTAS_GENERATE,
    risk: "R2_ASSISTED_DRAFT",
    inputSchema: schema({
      type: "object",
      required: ["pieceType", "facts"],
      additionalProperties: false,
      properties: {
        caseId: { type: "string" },
        pieceType: { type: "string" },
        facts: { type: "string" },
        sources: { type: "array", items: { type: "string" } },
        instructions: { type: "string" },
      },
    }),
    outputSchema: schema({
      type: "object",
      required: ["ok", "draft", "sourcesUsed", "warnings", "needsHumanReview"],
      properties: {
        ok: { type: "boolean" },
        draft: { type: "string" },
        sourcesUsed: { type: "array" },
        warnings: { type: "array" },
        needsHumanReview: { type: "boolean" },
      },
    }),
    humanReviewRequired: true,
  }),
  tool({
    name: "mitra.veritas",
    title: "Veritas",
    description: "Verifica consistência, fontes e riscos de tese ou minuta.",
    backend: MITRA_MCP_V1_BACKENDS.MITRA_LEGAL_ORCHESTRATOR,
    requiredScope: MITRA_MCP_V1_SCOPES.VERITAS_RUN,
    risk: "R2_ASSISTED_REVIEW",
    inputSchema: schema({
      type: "object",
      required: ["text"],
      additionalProperties: false,
      properties: {
        text: { type: "string" },
        sources: { type: "array", items: { type: "string" } },
        objective: { type: "string" },
      },
    }),
    outputSchema: schema({
      type: "object",
      required: ["ok", "findings", "unsupportedClaims", "sourceIssues", "needsHumanReview"],
      properties: {
        ok: { type: "boolean" },
        findings: { type: "array" },
        unsupportedClaims: { type: "array" },
        sourceIssues: { type: "array" },
        needsHumanReview: { type: "boolean" },
      },
    }),
    humanReviewRequired: true,
  }),
]);

export const MITRA_MCP_V1_ERROR_CODES = freeze([
  "unauthorized",
  "forbidden",
  "insufficient_scope",
  "tenant_not_found",
  "case_not_found",
  "source_unavailable",
  "provider_timeout",
  "invalid_input",
  "dependency_unavailable",
  "human_review_required",
]);

export function listMitraMcpV1Tools({ backend } = {}) {
  return backend
    ? MITRA_MCP_V1_TOOLS.filter((item) => item.backend === backend)
    : [...MITRA_MCP_V1_TOOLS];
}

export function getMitraMcpV1Tool(name) {
  return MITRA_MCP_V1_TOOLS.find((item) => item.name === name) || null;
}

export function listMitraMcpV1Scopes() {
  return Object.values(MITRA_MCP_V1_SCOPES);
}

export function assertMitraMcpV1Tool(name) {
  const definition = getMitraMcpV1Tool(name);
  if (!definition) {
    const error = new Error(`Unknown Mitra MCP v1 tool: ${name}`);
    error.code = "unknown_tool";
    throw error;
  }
  return definition;
}

export function createMitraMcpV1ContractSummary() {
  return freeze({
    ok: true,
    service: "mitra-mcp",
    version: MITRA_MCP_V1_VERSION,
    toolCount: MITRA_MCP_V1_TOOLS.length,
    tools: MITRA_MCP_V1_TOOLS.map((item) => item.name),
    scopes: listMitraMcpV1Scopes(),
    safety: MITRA_MCP_V1_SAFETY,
  });
}
