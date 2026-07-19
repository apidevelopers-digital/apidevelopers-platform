import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.mjs";
import { createClientRegistry } from "../src/client-registry.mjs";
import { startServer } from "../src/server.mjs";

test("HTTP server exposes the application contract", async (context) => {
  const app = createApp({
    clientRegistry: createClientRegistry(),
    adminKey: "admin-test-key",
    requestIdFactory: () => "request-http-001",
  });

  const server = await startServer({
    port: 0,
    host: "127.0.0.1",
    app,
  });
  context.after(
    () =>
      new Promise((resolvePromise) =>
        server.close(resolvePromise),
      ),
  );

  const address = server.address();
  const response = await fetch(
    `http://127.0.0.1:${address.port}/health`,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
  assert.equal(
    response.headers.get("x-request-id"),
    "request-http-001",
  );
});
