import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";

import { createOperatorSecretHandoffNodeHandler } from "../src/operator-secret-handoff-node-http.mjs";

function nodeRequest({
  body = Buffer.alloc(0),
  url = "/v1/operator/secret-handoff/session-001/submit",
  method = "POST",
  headers = {},
} = {}) {
  const request = Readable.from([Buffer.from(body)]);
  request.method = method;
  request.url = url;
  request.headers = {
    "content-type": "application/octet-stream",
    "content-length": String(body.length),
    ...headers,
  };
  return request;
}

function nodeResponse() {
  return {
    status: null,
    headers: null,
    body: null,
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body) {
      this.body = body;
    },
  };
}

test("Node boundary delivers Buffer to secret http app without utf8 conversion", async () => {
  let observedBody;
  const httpApp = {
    async handleRequest(request) {
      assert.equal(Buffer.isBuffer(request.body), true);
      observedBody = request.body;
      assert.equal(Buffer.from(request.body).toString("utf8"), "temporary-secret");
      return { status: 202, headers: { "content-type": "application/json" }, body: '{"ok":true}' };
    },
  };
  const handler = createOperatorSecretHandoffNodeHandler({ httpApp });
  const request = nodeRequest({ body: Buffer.from("temporary-secret") });
  const response = nodeResponse();

  assert.equal(await handler.handle(request, response), true);
  assert.equal(response.status, 202);
  assert.equal([...observedBody].every((value) => value === 0), true);
});

test("Node boundary rejects oversized secret before http app is called", async () => {
  let called = false;
  const httpApp = {
    async handleRequest() {
      called = true;
      return { status: 202, headers: {}, body: "{}" };
    },
  };
  const handler = createOperatorSecretHandoffNodeHandler({ httpApp, maxBodyBytes: 4 });
  const request = nodeRequest({ body: Buffer.from("12345") });
  const response = nodeResponse();

  assert.equal(await handler.handle(request, response), true);
  assert.equal(response.status, 413);
  assert.equal(called, false);
});

test("Node boundary declines unrelated routes without consuming their body", async () => {
  let called = false;
  const handler = createOperatorSecretHandoffNodeHandler({
    httpApp: {
      async handleRequest() {
        called = true;
        return { status: 500, headers: {}, body: "{}" };
      },
    },
  });
  const request = nodeRequest({ url: "/health", method: "GET", body: Buffer.from("not-consumed") });
  const response = nodeResponse();

  assert.equal(await handler.handle(request, response), false);
  assert.equal(called, false);
  assert.equal(response.status, null);
});
