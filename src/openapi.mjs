const ROUTES = Object.freeze([
  Object.freeze({
    method: "get",
    path: "/health",
    operationId: "getGatewayHealth",
    summary: "Gateway liveness",
    security: [],
    responses: {
      200: {
        description: "Gateway process is available",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/HealthResponse" },
          },
        },
      },
    },
  }),
  Object.freeze({
    method: "get",
    path: "/ready",
    operationId: "getGatewayReadiness",
    summary: "Gateway dependency readiness",
    security: [],
    responses: {
      200: {
        description: "Gateway is ready to receive traffic",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ReadinessResponse" },
          },
        },
      },
      503: {
        description: "Gateway is degraded or unavailable",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ReadinessResponse" },
          },
        },
      },
    },
  }),
  Object.freeze({
    method: "get",
    path: "/openapi.json",
    operationId: "getOpenApiDocument",
    summary: "Machine-readable API contract",
    security: [],
    responses: {
      200: {
        description: "OpenAPI document",
        content: {
          "application/json": {
            schema: { type: "object" },
          },
        },
      },
    },
  }),
  Object.freeze({
    method: "get",
    path: "/v1/whoami",
    operationId: "getAuthenticatedIdentity",
    summary: "Authenticated identity and tenant context",
    security: [{ ApiKeyAuth: [] }],
    responses: {
      200: {
        description: "Identity and tenant context",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/WhoAmIResponse" },
          },
        },
      },
      401: {
        description: "Authentication rejected",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
      403: {
        description: "Tenant context unavailable",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
      503: {
        description: "Authentication service unavailable",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
    },
  }),
]);

function buildPaths() {
  return Object.fromEntries(
    ROUTES.map((route) => [
      route.path,
      {
        [route.method]: {
          operationId: route.operationId,
          summary: route.summary,
          security: route.security,
          responses: route.responses,
        },
      },
    ]),
  );
}

const OPEN_API_DOCUMENT = Object.freeze({
  openapi: "3.1.0",
  info: Object.freeze({
    title: "API Developers.digital Gateway API",
    version: "0.7.0",
    description:
      "Current public developer and operational surface of the institutional API gateway.",
  }),
  servers: Object.freeze([
    Object.freeze({
      url: "http://127.0.0.1:3000",
      description: "Local development",
    }),
  ]),
  paths: Object.freeze(buildPaths()),
  components: Object.freeze({
    securitySchemes: Object.freeze({
      ApiKeyAuth: Object.freeze({
        type: "apiKey",
        in: "header",
        name: "x-api-key",
      }),
    }),
    schemas: Object.freeze({
      HealthResponse: Object.freeze({
        type: "object",
        required: ["service", "status"],
        properties: {
          service: { type: "string", const: "api-gateway" },
          status: { type: "string", const: "ok" },
        },
        additionalProperties: false,
      }),
      ReadinessCheck: Object.freeze({
        type: "object",
        required: ["name", "critical", "status"],
        properties: {
          name: { type: "string" },
          critical: { type: "boolean" },
          status: { type: "string", enum: ["ok", "error"] },
          code: { type: "string" },
        },
        additionalProperties: false,
      }),
      ReadinessResponse: Object.freeze({
        type: "object",
        required: ["service", "status", "checkedAt", "checks"],
        properties: {
          service: { type: "string", const: "api-gateway" },
          status: {
            type: "string",
            enum: ["ready", "degraded", "unavailable"],
          },
          checkedAt: { type: "string", format: "date-time" },
          checks: {
            type: "array",
            items: { $ref: "#/components/schemas/ReadinessCheck" },
          },
        },
        additionalProperties: false,
      }),
      ErrorResponse: Object.freeze({
        type: "object",
        required: ["error"],
        properties: {
          error: { type: "string" },
          message: { type: "string" },
        },
        additionalProperties: true,
      }),
      PublicPrincipal: Object.freeze({
        type: "object",
        properties: {
          id: { type: "string" },
          tenantId: { type: "string" },
          name: { type: "string" },
          status: { type: "string" },
          scopes: {
            type: "array",
            items: { type: "string" },
          },
          prefix: { type: "string" },
        },
        additionalProperties: false,
      }),
      PublicIdentity: Object.freeze({
        type: "object",
        required: ["principal"],
        properties: {
          role: { type: "string" },
          principal: { $ref: "#/components/schemas/PublicPrincipal" },
        },
        additionalProperties: false,
      }),
      TenantContext: Object.freeze({
        type: "object",
        required: ["tenantId", "region", "scopes"],
        properties: {
          tenantId: { type: "string" },
          region: { type: "string" },
          scopes: {
            type: "array",
            items: { type: "string" },
          },
        },
        additionalProperties: true,
      }),
      WhoAmIResponse: Object.freeze({
        type: "object",
        required: ["identity", "tenantContext"],
        properties: {
          identity: { $ref: "#/components/schemas/PublicIdentity" },
          tenantContext: { $ref: "#/components/schemas/TenantContext" },
        },
        additionalProperties: false,
      }),
    }),
  }),
});

export function getGatewayRouteManifest() {
  return structuredClone(ROUTES);
}

export function getOpenApiDocument() {
  return structuredClone(OPEN_API_DOCUMENT);
}
