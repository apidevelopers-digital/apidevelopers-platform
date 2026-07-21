import assert from "node:assert/strict";
import { ReadApiClient } from "../public/api-client.js";

const originalFetch = globalThis.fetch;
const gatewayPolicy = {
  allowedGatewayOrigins: ["https://gateway.example.test"],
};

try {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          data: {
            summary: { title: "Instituição" },
            records: [{ id: "record-1" }],
            modules: [],
            versions: [],
            integrity: { status: "healthy", sources: [] },
          },
          meta: { projectionVersion: "institutional-v1", stale: false },
        };
      },
    };
  };

  const client = new ReadApiClient({
    baseUrl: "https://gateway.example.test/",
    apiKey: "read-key",
    timeoutMs: 500,
    gatewayPolicy,
  });

  const institutional = await client.institutionalSnapshot();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://gateway.example.test/v1/portal/snapshot");
  assert.equal(calls[0].options.method, "GET");
  assert.deepEqual(calls[0].options.headers, {
    accept: "application/json",
    "x-api-key": "read-key",
  });
  assert.equal(calls[0].options.credentials, "omit");
  assert.equal(calls[0].options.cache, "no-store");
  assert.ok(calls[0].options.signal instanceof AbortSignal);
  assert.equal(institutional.records.length, 1);
  assert.equal(institutional.meta.projectionVersion, "institutional-v1");

  globalThis.fetch = async () => ({
    ok: false,
    status: 503,
    async json() {
      return { error: { code: "UPSTREAM_UNAVAILABLE" } };
    },
  });

  await assert.rejects(
    () => client.learningSnapshot(),
    (error) => {
      assert.equal(error.message, "UPSTREAM_UNAVAILABLE");
      assert.equal(error.status, 503);
      assert.equal(error.retryable, true);
      return true;
    },
  );

  globalThis.fetch = async (_url, options) =>
    new Promise((_resolve, reject) => {
      options.signal.addEventListener(
        "abort",
        () => reject(new DOMException("aborted", "AbortError")),
        { once: true },
      );
    });

  const timeoutClient = new ReadApiClient({
    baseUrl: "https://gateway.example.test",
    timeoutMs: 100,
    gatewayPolicy,
  });

  await assert.rejects(
    () => timeoutClient.institutionalSnapshot(),
    (error) => {
      assert.equal(error.message, "REQUEST_TIMEOUT");
      assert.equal(error.status, 504);
      assert.equal(error.retryable, true);
      return true;
    },
  );

  const external = new AbortController();
  const cancelled = timeoutClient.learningSnapshot({ signal: external.signal });
  external.abort("USER_CANCELLED");

  await assert.rejects(
    () => cancelled,
    (error) => {
      assert.equal(error.message, "REQUEST_CANCELLED");
      assert.equal(error.status, 499);
      assert.equal(error.retryable, false);
      return true;
    },
  );

  let networkCalls = 0;
  globalThis.fetch = async () => {
    networkCalls += 1;
    throw new Error("must not run");
  };

  const blockedClient = new ReadApiClient({
    baseUrl: "https://forbidden.example.test",
    gatewayPolicy,
  });

  await assert.rejects(
    () => blockedClient.institutionalSnapshot(),
    (error) => {
      assert.equal(error.message, "GATEWAY_ORIGIN_FORBIDDEN");
      assert.equal(error.status, 400);
      assert.equal(error.retryable, false);
      return true;
    },
  );
  assert.equal(networkCalls, 0);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("developer-portal resilient read api client: ok");
