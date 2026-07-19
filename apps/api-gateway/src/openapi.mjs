const security = [{ ApiKeyAuth: [] }];
const json = (schema) => ({ "application/json": { schema } });
const ok = (description = "Success") => ({ 200: { description } });
const adminErrors = {
  401: { description: "API Key ausente ou inválida" },
  403: { description: "Privilégio administrativo necessário" },
  429: { description: "Rate limit excedido" },
};

export const openApiDocument = Object.freeze({
  openapi: "3.1.0",
  info: {
    title: "API Developers.digital Platform API",
    version: "0.2.0",
    description: "Gateway MVP com clientes, API Keys, rotação, revogação, auditoria e rate limiting.",
  },
  servers: [{ url: "http://127.0.0.1:3000", description: "Desenvolvimento local" }],
  components: {
    securitySchemes: {
      ApiKeyAuth: { type: "apiKey", in: "header", name: "x-api-key" },
    },
    schemas: {
      ApiKey: {
        type: "object",
        properties: {
          id: { type: "string" },
          prefix: { type: "string" },
          status: { type: "string", enum: ["active", "revoked"] },
          createdAt: { type: "string", format: "date-time" },
          revokedAt: { type: ["string", "null"], format: "date-time" },
        },
      },
      Client: {
        type: "object",
        required: ["id", "name", "contactEmail", "status", "scopes", "keys"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          contactEmail: { type: "string", format: "email" },
          status: { type: "string", enum: ["active", "suspended", "revoked"] },
          scopes: { type: "array", items: { type: "string" } },
          keys: { type: "array", items: { $ref: "#/components/schemas/ApiKey" } },
        },
      },
    },
  },
  paths: {
    "/health": {
      get: { summary: "Verifica a saúde do gateway", responses: ok("Gateway operacional") },
    },
    "/v1/apis": {
      get: { summary: "Lista o catálogo público", responses: ok("Catálogo público") },
    },
    "/openapi.json": {
      get: { summary: "Retorna este contrato OpenAPI", responses: ok("Contrato OpenAPI") },
    },
    "/v1/me": {
      get: {
        summary: "Retorna a identidade autenticada",
        security,
        responses: { ...ok("Identidade autenticada"), 401: { description: "API Key inválida" }, 429: { description: "Rate limit excedido" } },
      },
    },
    "/v1/admin/status": {
      get: { summary: "Retorna status administrativo", security, responses: { ...ok(), ...adminErrors } },
    },
    "/v1/admin/clients": {
      get: { summary: "Lista clientes", security, responses: { ...ok(), ...adminErrors } },
      post: {
        summary: "Cadastra cliente e emite a primeira API Key",
        security,
        requestBody: {
          required: true,
          content: json({
            type: "object",
            required: ["name", "contactEmail"],
            properties: {
              name: { type: "string" },
              contactEmail: { type: "string", format: "email" },
              scopes: { type: "array", items: { type: "string" } },
            },
          }),
        },
        responses: { 201: { description: "Cliente criado; chave retornada uma única vez" }, ...adminErrors },
      },
    },
    "/v1/admin/clients/{clientId}": {
      parameters: [{ name: "clientId", in: "path", required: true, schema: { type: "string" } }],
      get: { summary: "Obtém cliente", security, responses: { ...ok(), ...adminErrors, 404: { description: "Cliente não encontrado" } } },
      patch: {
        summary: "Atualiza status do cliente",
        security,
        requestBody: { required: true, content: json({ type: "object", required: ["status"], properties: { status: { type: "string", enum: ["active", "suspended", "revoked"] } } }) },
        responses: { ...ok(), ...adminErrors, 404: { description: "Cliente não encontrado" } },
      },
    },
    "/v1/admin/clients/{clientId}/keys": {
      parameters: [{ name: "clientId", in: "path", required: true, schema: { type: "string" } }],
      post: {
        summary: "Emite ou rotaciona API Key",
        security,
        requestBody: { content: json({ type: "object", properties: { revokeExisting: { type: "boolean", default: false } } }) },
        responses: { 201: { description: "Chave emitida uma única vez" }, ...adminErrors },
      },
    },
    "/v1/admin/clients/{clientId}/keys/{keyId}": {
      parameters: [
        { name: "clientId", in: "path", required: true, schema: { type: "string" } },
        { name: "keyId", in: "path", required: true, schema: { type: "string" } },
      ],
      delete: { summary: "Revoga uma API Key", security, responses: { ...ok(), ...adminErrors, 404: { description: "Chave não encontrada" } } },
    },
    "/v1/admin/audit": {
      get: {
        summary: "Lista eventos administrativos auditados",
        security,
        parameters: [{ name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 500 } }],
        responses: { ...ok(), ...adminErrors },
      },
    },
  },
});

export function getOpenApiDocument() {
  return structuredClone(openApiDocument);
}
