
import assert from "node:assert/strict";
import test from "node:test";

import {
  createApp,
  createHttpServer,
} from "../src/server.mjs";
import {
  createInMemoryRadarEventIngestor,
} from "../src/radar-signal-event.mjs";
import {
  getOpenApiDocument,
  getGatewayRouteManifest,
} from "../src/openapi.mjs";

function event(overrides = {}) {
  return {
    schema: "radar.signal.v1",
    event_id: "evt_http_001",
    event_type: "visitor.page.viewed",
    occurred_at: "2026-08-26T18:00:00-03:00",
    received_at: "2026-08-26T18:00:01-03:00",
    organization_id: "org_api_developers",
    tenant_id: "tenant_api_developers",
    product_id: "product:radar",
    source: {
      channel: "web",
      surface: "api-developers-site",
      provider: "first-party",
    },
    subject: {
      kind: "anonymous",
      subject_id: "sub_http_001",
    },
    correlation_id: "corr_http_001",
    consent: {
      status: "unknown",
      purpose: "analytics",
    },
    context: {},
    payload: {},
    ...overrides,
  };
}

function authenticator(scopes = ["radar:events:write"]) {
  return {
    async authenticate() {
      return {
        role: "adapter",
        principal: {
          id: "adapter_api_site",
          tenantId: "tenant_api_developers",
          scopes,
        },
      };
    },
  };
}

test("POST /v1/radar/events accepts a valid event in shadow mode", async () => {
  const radarEvents = createInMemoryRadarEventIngestor();
  const app = createApp({
    authenticator: authenticator(),
    radarEvents,
  });

  const response = await app.handleRequest({
    method: "POST",
    url: "/v1/radar/events",
    body: JSON.stringify(event()),
  });

  assert.equal(response.status, 202);
  assert.deepEqual(JSON.parse(response.body), {
    accepted: true,
    duplicate: false,
    eventId: "evt_http_001",
    correlationId: "corr_http_001",
    schema: "radar.signal.v1",
    mode: "shadow",
    outboundTriggered: false,
  });
  assert.equal(await radarEvents.count(), 1);
});

test("POST /v1/radar/events is idempotent for an identical event", async () => {
  const radarEvents = createInMemoryRadarEventIngestor();
  const app = createApp({
    authenticator: authenticator(),
    radarEvents,
  });
  const request = {
    method: "POST",
    url: "/v1/radar/events",
    body: JSON.stringify(event()),
  };

  const first = await app.handleRequest(request);
  const duplicate = await app.handleRequest(request);

  assert.equal(first.status, 202);
  assert.equal(duplicate.status, 200);
  assert.equal(JSON.parse(duplicate.body).duplicate, true);
  assert.equal(await radarEvents.count(), 1);
});

test("POST /v1/radar/events rejects cross-tenant payloads", async () => {
  const app = createApp({
    authenticator: authenticator(),
    radarEvents: createInMemoryRadarEventIngestor(),
  });

  const response = await app.handleRequest({
    method: "POST",
    url: "/v1/radar/events",
    body: JSON.stringify(event({ tenant_id: "tenant_other" })),
  });

  assert.equal(response.status, 403);
  assert.deepEqual(JSON.parse(response.body), {
    accepted: false,
    reason: "tenant_mismatch",
    field: "tenant_id",
  });
});

test("POST /v1/radar/events requires the dedicated write scope", async () => {
  const app = createApp({
    authenticator: authenticator(["projects:read"]),
    radarEvents: createInMemoryRadarEventIngestor(),
  });

  const response = await app.handleRequest({
    method: "POST",
    url: "/v1/radar/events",
    body: JSON.stringify(event()),
  });

  assert.equal(response.status, 403);
  assert.deepEqual(JSON.parse(response.body), {
    accepted: false,
    reason: "insufficient_scope",
  });
});

test("POST /v1/radar/events fails closed when ingestion is not composed", async () => {
  const app = createApp({
    authenticator: authenticator(),
  });

  const response = await app.handleRequest({
    method: "POST",
    url: "/v1/radar/events",
    body: JSON.stringify(event()),
  });

  assert.equal(response.status, 503);
  assert.deepEqual(JSON.parse(response.body), {
    accepted: false,
    reason: "radar_ingestion_unavailable",
  });
});

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server.address();
}

async function close(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test("Gateway transport rejects an oversized Radar body before app handling", async (t) => {
  let calls = 0;
  const server = createHttpServer({
    maxBodyBytes: 256,
    app: {
      async handleRequest() {
        calls += 1;
        return {
          status: 200,
          headers: { "content-type": "application/json" },
          body: "{}",
        };
      },
    },
  });

  const address = await listen(server);
  t.after(() => close(server));

  const response = await fetch(
    `http://127.0.0.1:${address.port}/v1/radar/events`,
    {
      method: "POST",
      body: "x".repeat(512),
    },
  );

  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), {
    error: "payload_too_large",
  });
  assert.equal(calls, 0);
});

test("OpenAPI exposes Radar shadow ingestion as authenticated POST", () => {
  const manifest = getGatewayRouteManifest();
  const radarRoute = manifest.find(
    (route) => route.path === "/v1/radar/events",
  );
  const openapi = getOpenApiDocument();

  assert.equal(radarRoute.method, "post");
  assert.deepEqual(radarRoute.security, [{ ApiKeyAuth: [] }]);
  assert.equal(radarRoute.requestBody.required, true);
  assert.equal(
    openapi.paths["/v1/radar/events"].post.operationId,
    "ingestRadarSignalEvent",
  );
  assert.equal(
    openapi.components.schemas.RadarSignalEvent.properties.schema.const,
    "radar.signal.v1",
  );
});
