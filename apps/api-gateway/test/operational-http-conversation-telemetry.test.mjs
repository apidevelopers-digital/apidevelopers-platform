import assert from "node:assert/strict";
import test from "node:test";

import { createOperationalHttpServer } from "../src/operational-http-transport.mjs";

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

test("conversation telemetry logs only safe public response metadata", async (t) => {
  const lines = [];
  const server = createOperationalHttpServer({
    logger: { log(line) { lines.push(line); } },
    app: {
      async handleRequest() {
        return {
          status: 400,
          headers: { "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify({
            error: "access_context_required",
            message: "sensitive diagnostic must not be logged",
          }),
        };
      },
    },
  });

  const address = await listen(server);
  t.after(() => close(server));

  const response = await fetch(
    `http://127.0.0.1:${address.port}/v1/web-agent/conversations`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "__Host-apidevelopers-session=super-secret-session",
      },
      body: JSON.stringify({
        accessGrantId: "grant-secret-ish-id",
        workspaceId: "workspace_1",
        productId: "product:uni-co",
      }),
    },
  );

  assert.equal(response.status, 400);
  assert.equal(lines.length, 1);

  const event = JSON.parse(lines[0]);
  assert.deepEqual(event, {
    event: "web_agent_conversation_http",
    stage: "app_response",
    method: "POST",
    path: "/v1/web-agent/conversations",
    status: 400,
    bodyBytes: Buffer.byteLength(JSON.stringify({
      error: "access_context_required",
      message: "sensitive diagnostic must not be logged",
    }), "utf8"),
    contentType: "application/json; charset=utf-8",
    error: "access_context_required",
  });

  const serialized = JSON.stringify(event);
  assert.equal(serialized.includes("super-secret-session"), false);
  assert.equal(serialized.includes("grant-secret-ish-id"), false);
  assert.equal(serialized.includes("sensitive diagnostic"), false);
});

test("conversation telemetry records transport failure without request material", async (t) => {
  const lines = [];
  let calls = 0;
  const server = createOperationalHttpServer({
    maxBodyBytes: 1024,
    logger: { log(line) { lines.push(line); } },
    app: {
      async handleRequest() {
        calls += 1;
        return { status: 200, headers: {}, body: "{}" };
      },
    },
  });

  const address = await listen(server);
  t.after(() => close(server));

  const response = await fetch(
    `http://127.0.0.1:${address.port}/v1/web-agent/conversations`,
    {
      method: "POST",
      body: "x".repeat(2048),
    },
  );

  assert.equal(response.status, 413);
  assert.equal(calls, 0);
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), {
    event: "web_agent_conversation_http",
    stage: "transport_error",
    method: "POST",
    path: "/v1/web-agent/conversations",
    status: 413,
    bodyBytes: 0,
    contentType: "application/json; charset=utf-8",
    error: "request_too_large",
  });
});
