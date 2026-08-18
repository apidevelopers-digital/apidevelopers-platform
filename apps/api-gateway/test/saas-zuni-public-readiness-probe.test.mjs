import test from "node:test";
import assert from "node:assert/strict";
import {
  createZuniPublicReadinessProbe,
  ZUNI_READINESS_URL,
} from "../src/saas-zuni-public-readiness-probe.mjs";

const SHA = "082d43c86254b6d260a7fd62f8ced027f9780c28";

function response(payload, { status = 200, ok = true } = {}) {
  return {
    status,
    ok,
    async json() {
      return payload;
    },
  };
}

test("Zuni public readiness probe uses only the fixed public GET endpoint and returns release evidence", async () => {
  const calls = [];
  const probe = createZuniPublicReadinessProbe({
    fetchFn: async (url, options) => {
      calls.push({ url, options });
      return response({
        ok: true,
        ready: true,
        product: "zuni",
        environment: "production",
        releaseSha: SHA,
        transport: "git",
        secretsExposed: false,
        checks: { product: true, sha: true },
      });
    },
  });

  const result = await probe();

  assert.equal(result.ready, true);
  assert.equal(result.releaseSha, SHA);
  assert.equal(result.productId, "zuni");
  assert.equal(result.source, "zuni.public.readiness");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, ZUNI_READINESS_URL);
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.redirect, "error");
  assert.equal(calls[0].options.headers["Cache-Control"], "no-store");
  assert.ok(calls[0].options.signal);
});

test("Zuni public readiness probe fails closed on HTTP non-200", async () => {
  const probe = createZuniPublicReadinessProbe({
    fetchFn: async () => response({ ready: false }, { status: 503, ok: false }),
  });

  const result = await probe();

  assert.equal(result.ready, false);
  assert.equal(result.code, "zuni_readiness_http_not_ready");
  assert.equal(result.httpStatus, 503);
});

test("Zuni public readiness probe fails closed when the public contract is unsafe or inconsistent", async () => {
  const probe = createZuniPublicReadinessProbe({
    fetchFn: async () =>
      response({
        ok: true,
        ready: true,
        product: "zuni",
        environment: "production",
        releaseSha: "not-a-sha",
        transport: "git",
        secretsExposed: true,
      }),
  });

  const result = await probe();

  assert.equal(result.ready, false);
  assert.equal(result.code, "zuni_readiness_contract_failed");
  assert.deepEqual(result.failedChecks.sort(), ["releaseSha", "secrets"].sort());
  assert.equal(result.releaseSha, null);
});

test("Zuni public readiness probe fails closed on invalid JSON", async () => {
  const probe = createZuniPublicReadinessProbe({
    fetchFn: async () => ({
      status: 200,
      ok: true,
      async json() {
        throw new SyntaxError("invalid json");
      },
    }),
  });

  const result = await probe();

  assert.equal(result.ready, false);
  assert.equal(result.code, "zuni_readiness_invalid_json");
});
