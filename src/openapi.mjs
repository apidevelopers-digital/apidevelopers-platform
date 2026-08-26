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
    method: "post",
    path: "/v1/radar/events",
    operationId: "ingestRadarSignalEvent",
    summary: "Validate and ingest a Radar signal event in shadow mode",
    security: [{ ApiKeyAuth: [] }],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/RadarSignalEvent" },
        },
      },
    },
    responses: {
      202: {
        description: "New event accepted in shadow mode",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/RadarSignalAccepted" },
          },
        },
      },
      200: {
        description: "Idempotent duplicate accepted without duplicate effect",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/RadarSignalAccepted" },
          },
        },
      },
      400: {
        description: "Invalid Radar signal payload",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/RadarSignalRejected" },
          },
        },
      },
      401: {
        description: "Authentication rejected",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/RadarSignalRejected" },
          },
        },
      },
      403: {
        description: "Tenant context, scope, or tenant boundary rejected",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/RadarSignalRejected" },
          },
        },
      },
      409: {
        description: "event_id reused for a different event",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/RadarSignalRejected" },
          },
        },
      },
      503: {
        description: "Authentication or Radar ingestion composition unavailable",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/RadarSignalRejected" },
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
          ...(route.requestBody ? { requestBody: route.requestBody } : {}),
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
    version: "0.8.0",
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
      RadarSignalEvent: Object.freeze({
        type: "object",
        required: [
          "schema",
          "event_id",
          "event_type",
          "occurred_at",
          "received_at",
          "organization_id",
          "tenant_id",
          "product_id",
          "source",
          "subject",
          "correlation_id",
          "consent",
          "context",
          "payload",
        ],
        properties: {
          schema: { type: "string", const: "radar.signal.v1" },
          event_id: { type: "string", minLength: 1 },
          event_type: { type: "string", minLength: 1 },
          occurred_at: { type: "string", format: "date-time" },
          received_at: { type: "string", format: "date-time" },
          organization_id: { type: "string", minLength: 1 },
          tenant_id: { type: "string", minLength: 1 },
          product_id: { type: "string", const: "product:radar" },
          source: {
            type: "object",
            required: ["channel", "surface", "provider"],
            properties: {
              channel: {
                type: "string",
                enum: ["web", "whatsapp", "instagram", "facebook", "other"],
              },
              surface: { type: "string", minLength: 1 },
              provider: { type: "string", minLength: 1 },
            },
            additionalProperties: false,
          },
          subject: {
            type: "object",
            required: ["kind", "subject_id"],
            properties: {
              kind: {
                type: "string",
                enum: ["anonymous", "lead", "customer"],
              },
              subject_id: { type: "string", minLength: 1 },
            },
            additionalProperties: false,
          },
          correlation_id: { type: "string", minLength: 1 },
          consent: {
            type: "object",
            required: ["status", "purpose"],
            properties: {
              status: {
                type: "string",
                enum: ["unknown", "granted", "denied", "revoked"],
              },
              purpose: {
                type: "string",
                enum: ["analytics", "commercial", "support", "handoff"],
              },
              evidence_id: { type: "string", minLength: 1 },
            },
            additionalProperties: false,
          },
          context: { type: "object" },
          payload: { type: "object" },
        },
        additionalProperties: true,
      }),
      RadarSignalAccepted: Object.freeze({
        type: "object",
        required: [
          "accepted",
          "duplicate",
          "eventId",
          "correlationId",
          "schema",
          "mode",
          "outboundTriggered",
        ],
        properties: {
          accepted: { type: "boolean", const: true },
          duplicate: { type: "boolean" },
          eventId: { type: "string" },
          correlationId: { type: "string" },
          schema: { type: "string", const: "radar.signal.v1" },
          mode: { type: "string", const: "shadow" },
          outboundTriggered: { type: "boolean", const: false },
        },
        additionalProperties: false,
      }),
      RadarSignalRejected: Object.freeze({
        type: "object",
        required: ["accepted", "reason"],
        properties: {
          accepted: { type: "boolean", const: false },
          reason: { type: "string" },
          field: { type: "string" },
        },
        additionalProperties: false,
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
