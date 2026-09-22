import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";

import { createOperatorSecretHandoffNodeHandler } from "../src/operator-secret-handoff-node-http.mjs";

function request({
  body = Buffer.alloc(0),
  method = "POST",
  headers = {},
} = {}) {
  const req = Readable.from([Buffer.from(body)]);
  req.method = method;
  req.url = "/v1/operator/secret-handoff/session-hardening/submit";
  req.headers = {
    "content-type": "application/octet-stream",
    "content-length": String(body.length),
    ...headers,
  };
  return req;
}

function response() {
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

test("secret route intercepts wrong methods without falling through generic parser", async () => {
  let observed;
  const handler = createOperatorSecretHandoffNodeHandler({
    httpApp: {
      async handleRequest(input) {
        observed = input;
        return {
          status: 405,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ error: "method_not_allowed" }),
        };
      },
    },
  });
  const req = request({ method: "GET", body: Buffer.from("must-not-be-consumed") });
  const res = response();

  assert.equal(await handler.handle(req, res), true);
  assert.equal(res.status, 405);
  assert.equal(observed.method, "GET");
  assert.equal(Object.hasOwn(observed, "body"), false);
});

test("malformed content-length fails closed before secret app receives bytes", async () => {
  let called = false;
  const handler = createOperatorSecretHandoffNodeHandler({
    httpApp: {
      async handleRequest() {
        called = true;
        return { status: 202, headers: {}, body: "{}" };
      },
    },
  });
  const req = request({
    body: Buffer.from("fake-secret"),
    headers: { "content-length": "-1" },
  });
  const res = response();

  assert.equal(await handler.handle(req, res), true);
  assert.equal(res.status, 400);
  assert.equal(called, false);
  assert.equal(res.headers["cache-control"], "no-store");
  assert.equal(res.headers["x-content-type-options"], "nosniff");
  assert.equal(res.headers["referrer-policy"], "no-referrer");
});

test("default transport ceiling matches canonical 8192-byte provider contract", async () => {
  let called = false;
  const handler = createOperatorSecretHandoffNodeHandler({
    httpApp: {
      async handleRequest() {
        called = true;
        return { status: 202, headers: {}, body: "{}" };
      },
    },
  });
  const req = request({ body: Buffer.alloc(8193, 97) });
  const res = response();

  assert.equal(await handler.handle(req, res), true);
  assert.equal(res.status, 413);
  assert.equal(called, false);
});
