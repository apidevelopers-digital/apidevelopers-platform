const security = [{ ApiKeyAuth: [] }];

const adminErrorResponses = {
  401: { description: "API Key ausente ou inválida" },
  403: {
    description: "Identidade sem papel ou escopo administrativo suficiente",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/ErrorEnvelope" },
      },
    },
  },
  429: { description: "Rate limit excedido" },
};

const adminOperation = ({ summary, scope, responses = {} }) => ({
  summary,
  security,
  "x-required-scopes": [scope],
  responses: {
    200: { description: "Success" },
    ...responses,
    ...adminErrorResponses,
  },
});

export const openApiDocument = Object.freeze({
  openapi: "3.1.0",
  info: {
    title: "API Developers.digital Platform API",
    version: "0.3.0",
    description:
      "Gateway MVP com catálogo, clientes, API Keys, escopos administrativos, auditoria e rate limiting.",
  },
  servers: [{ url: "http://127.0.0.1:3000", description: "Desenvolvimento local" }],
  components: {
    securitySchemes: {
      ApiKeyAuth: { type: "apiKey", in: "header", name: "x-api-key" },
    },
    schemas: {
      ErrorEnvelope: {
        type: "object",
        required: ["error", "message", "requestId"],
        properties: {
          error: { type: "string" },
          message: { type: "string" },
          requestId: { type: "string" },
          details: {
            type: "object",
            additionalProperties: true,
            properties: {
              requiredScopes: {
                type: "array",
                items: { type: "string" },
              },
              missingScopes: {
                type: "array",
                items: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
  paths: {
    "/health": {
      get: {
        summary: "Gateway health",
        responses: { 200: { description: "Gateway available" } },
      },
    },
    "/v1/apis": {
      get: {
        summary: "Public API catalog",
        responses: { 200: { description: "Catalog returned" } },
      },
    },
    "/v1/me": {
      get: {
        summary: "Authenticated identity",
        security,
        responses: {
          200: { description: "Identity returned" },
          401: { description: "API Key ausente ou inválida" },
          429: { description: "Rate limit excedido" },
        },
      },
    },
    "/v1/admin/status": {
      get: adminOperation({
        summary: "Administrative platform status",
        scope: "admin:status:read",
      }),
    },
    "/v1/admin/audit": {
      get: adminOperation({
        summary: "List audit entries",
        scope: "admin:audit:read",
      }),
    },
    "/v1/admin/clients": {
      get: adminOperation({
        summary: "List clients",
        scope: "admin:clients:read",
      }),
      post: adminOperation({
        summary: "Create client and initial API Key",
        scope: "admin:clients:write",
        responses: { 201: { description: "Client created" } },
      }),
    },
    "/v1/admin/clients/{clientId}": {
      parameters: [
        {
          name: "clientId",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      get: adminOperation({
        summary: "Get client",
        scope: "admin:clients:read",
      }),
      patch: adminOperation({
        summary: "Update client status",
        scope: "admin:clients:write",
      }),
    },
    "/v1/admin/clients/{clientId}/keys": {
      parameters: [
        {
          name: "clientId",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      post: adminOperation({
        summary: "Rotate client API Key",
        scope: "admin:keys:write",
        responses: { 201: { description: "API Key created" } },
      }),
    },
    "/v1/admin/clients/{clientId}/keys/{keyId}": {
      parameters: [
        {
          name: "clientId",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
        {
          name: "keyId",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      delete: adminOperation({
        summary: "Revoke client API Key",
        scope: "admin:keys:write",
      }),
    },
  },
});

export function getOpenApiDocument() {
  return structuredClone(openApiDocument);
}
