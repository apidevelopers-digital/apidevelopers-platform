import assert from "node:assert/strict";
import test from "node:test";

import {
  createOperationalHttpServer,
} from "../src/operational-http-transport.mjs";

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

test("transport passes bounded JSON body to the operational app", async (t) => {
  const calls = [];
  const server = createOperationalHttpServer({
    app: {
      async handleRequest(request) {
        calls.push(request);
        return {
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ok: true }),
        };
      },
    },
  });

  const address = await listen(server);
  t.after(() => close(server));

  const response = await fetch(
    `http://127.0.0.1:${address.port}/v1/operator/status`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ correlationId: "corr_1" }),
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].url, "/v1/operator/status");
  assert.deepEqual(JSON.parse(calls[0].body), { correlationId: "corr_1" });
});

test("transport rejects oversized body before calling the app", async (t) => {
  let calls = 0;
  const server = createOperationalHttpServer({
    maxBodyBytes: 1024,
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
    `http://127.0.0.1:${address.port}/v1/operator/status`,
    {
      method: "POST",
      body: "x".repeat(2048),
    },
  );
  const payload = await response.json();

  assert.equal(response.status, 413);
  assert.equal(payload.error, "request_too_large");
  assert.equal(payload.productionChanged, false);
  assert.equal(payload.contentReturned, false);
  assert.equal(calls, 0);
});

test("transport returns a sanitized internal error", async (t) => {
  const server = createOperationalHttpServer({
    app: {
      async handleRequest() {
        throw new Error("sensitive internal detail");
      },
    },
  });

  const address = await listen(server);
  t.after(() => close(server));

  const response = await fetch(`http://127.0.0.1:${address.port}/failure`, {
    method: "POST",
    body: "{}",
  });
  const payload = await response.json();

  assert.equal(response.status, 500);
  assert.deepEqual(payload, {
    error: "internal_error",
    productionChanged: false,
    contentReturned: false,
    rowsReturned: false,
    valuesReturned: false,
  });
  assert.equal(JSON.stringify(payload).includes("sensitive"), false);
});
