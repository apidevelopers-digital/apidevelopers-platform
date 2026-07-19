export const openApiDocument = Object.freeze({
  openapi: "3.1.0",
  info: {
    title: "API Developers.digital Platform API",
    version: "0.1.0",
    description:
      "MVP do gateway público com catálogo, autenticação por API Key e administração de clientes.",
  },
  servers: [{ url: "http://localhost:3000", description: "Desenvolvimento local" }],
  tags: [
    { name: "Platform" },
    { name: "Developer" },
    { name: "Administration" },
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "x-api-key",
      },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["error", "message"],
        properties: {
          error: { type: "string" },
          message: { type: "string" },
          requestId: { type: "string" },
        },
      },
      Client: {
        type: "object",
        required: ["id", "name", "contactEmail", "status", "scopes"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          contactEmail: { type: "string", format: "email" },
          status: { type: "string", enum: ["active", "suspended", "revoked"] },
          scopes: { type: "array", items: { type: "string" } },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
    },
  },
  paths: {
    "/health": {
      get: {
        tags: ["Platform"],
        summary: "Verifica a saúde do gateway",
        responses: { 200: { description: "Gateway operacional" } },
      },
    },
    "/v1/apis": {
      get: {
        tags: ["Platform"],
        summary: "Lista o catálogo público de APIs",
        responses: { 200: { description: "Catálogo público" } },
      },
    },
    "/v1/me": {
      get: {
        tags: ["Developer"],
        summary: "Retorna o cliente autenticado",
        security: [{ ApiKeyAuth: [] }],
        responses: {
          200: { description: "Identidade autenticada" },
          401: { description: "API Key ausente ou inválida" },
        },
      },
    },
    "/v1/admin/clients": {
      get: {
        tags: ["Administration"],
        summary: "Lista clientes cadastrados",
        security: [{ ApiKeyAuth: [] }],
        responses: {
          200: { description: "Clientes cadastrados" },
          401: { description: "API Key ausente ou inválida" },
          403: { description: "Privilégio administrativo necessário" },
        },
      },
      post: {
        tags: ["Administration"],
        summary: "Cadastra cliente e emite uma API Key",
        description: "A API Key é retornada uma única vez e não é persistida em texto puro.",
        security: [{ ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "contactEmail"],
                properties: {
                  name: { type: "string" },
                  contactEmail: { type: "string", format: "email" },
                  scopes: { type: "array", items: { type: "string" } },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Cliente criado" },
          400: { description: "Payload inválido" },
          401: { description: "API Key ausente ou inválida" },
          403: { description: "Privilégio administrativo necessário" },
        },
      },
    },
  },
});

export function getOpenApiDocument() {
  return structuredClone(openApiDocument);
}
