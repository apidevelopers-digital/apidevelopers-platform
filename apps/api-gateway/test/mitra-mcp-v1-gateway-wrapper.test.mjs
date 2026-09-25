import assert from "node:assert/strict";
import test from "node:test";

import { attachMitraMcpV1ToGateway } from "../src/mitra-mcp-v1-gateway-wrapper.mjs";

const jsonBody = (response) => JSON.parse(response.body);

test("Mitra MCP v1 gateway wrapper routes status before the wrapped app", async () => {
  const gateway = Object.freeze({
    authenticator: Object.freeze({
      async authenticate() {
        return Object.freeze({
          principal: Object.freeze({
            tenantId: "tenant_milena",
            scopes: Object.freeze(["mitra:status:read"]),
          }),
        });
      },
    }),
    app: Object.freeze({
      async handleRequest() {
        return { status: 418, headers: {}, body: "delegated" };
      },
    }),
  });

  const wrapped = attachMitraMcpV1ToGateway({ gateway });
  const response = await wrapped.app.handleRequest({
    method: "GET",
    url: "/v1/mitra/mcp/status",
  });

  assert.equal(response.status, 200);
  assert.equal(jsonBody(response).ok, true);
  assert.equal(jsonBody(response).tenantId, "tenant_milena");
  assert.equal(wrapped.app, wrapped.mitraMcpV1HttpApp);
});

test("Mitra MCP v1 gateway wrapper delegates unknown routes", async () => {
  const delegatedResponse = { status: 418, headers: {}, body: "delegated" };
  const wrapped = attachMitraMcpV1ToGateway({
    gateway: Object.freeze({
      authenticator: Object.freeze({
        async authenticate() {
          return null;
        },
      }),
      app: Object.freeze({
        async handleRequest() {
          return delegatedResponse;
        },
      }),
    }),
  });

  assert.deepEqual(
    await wrapped.app.handleRequest({ method: "GET", url: "/health" }),
    delegatedResponse,
  );
});

test("Mitra MCP v1 gateway wrapper fails closed when gateway dependencies are missing", () => {
  assert.throws(
    () => attachMitraMcpV1ToGateway({ gateway: { app: {} } }),
    /gateway\.app\.handleRequest/,
  );

  assert.throws(
    () => attachMitraMcpV1ToGateway({
      gateway: {
        app: { async handleRequest() {} },
        authenticator: {},
      },
    }),
    /gateway\.authenticator\.authenticate/,
  );
});
