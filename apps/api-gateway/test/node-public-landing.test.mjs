import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import {
  renderGatewayPublicLanding,
} from "../src/node-public-landing.mjs";
import {
  createOperationalHttpServer,
} from "../src/operational-http-transport.mjs";

function request({ port, path = "/", host = "gateway.apidevelopers.digital" }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path, method: "GET", headers: { host } },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

test("gateway landing is safe institutional html", () => {
  const html = renderGatewayPublicLanding();
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /API Gateway/);
  assert.match(html, /Operational Gateway/);
  assert.match(html, /API Developers\.digital/);
  assert.doesNotMatch(
    html,
    /OPERATOR_ADMIN_TOKEN|DATABASE_URL|process\.env|\/home\/|authorization|bearer|stack/i,
  );
});

test("gateway root returns landing without invoking operational app", async (t) => {
  let calls = 0;
  const app = {
    async handleRequest() {
      calls += 1;
      return { status: 200, headers: { "content-type": "application/json" }, body: "{}" };
    },
  };
  const server = createOperationalHttpServer({ app, logger: { log() {} } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;

  const result = await request({ port });
  assert.equal(result.status, 200);
  assert.match(result.headers["content-type"], /^text\/html/);
  assert.match(result.body, /API Gateway/);
  assert.equal(calls, 0);
});

test("unknown host keeps existing operational routing", async (t) => {
  let calls = 0;
  const app = {
    async handleRequest() {
      calls += 1;
      return {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ ok: true }),
      };
    },
  };
  const server = createOperationalHttpServer({ app, logger: { log() {} } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;

  const result = await request({ port, host: "example.com" });
  assert.equal(result.status, 200);
  assert.equal(calls, 1);
  assert.deepEqual(JSON.parse(result.body), { ok: true });
});
