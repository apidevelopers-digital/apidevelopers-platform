import assert from "node:assert/strict";
import test from "node:test";

import {
  OperatorGitHubReadonlyTransportError,
  createOperatorGitHubReadonlyTransport,
} from "../src/operator-github-readonly-transport.mjs";

function token520() {
  return `ghs_${"A".repeat(516)}`;
}

function mockResponse(body = "{}", headers = {}) {
  const bytes = Buffer.from(body, "utf8");
  const values = new Map(
    Object.entries({
      "content-length": String(bytes.byteLength),
      ...headers,
    }).map(([name, value]) => [name.toLowerCase(), String(value)]),
  );
  return {
    status: 200,
    headers: {
      get(name) {
        return values.get(String(name).toLowerCase()) ?? null;
      },
    },
    async arrayBuffer() {
      return bytes;
    },
  };
}

test("transport carries a 520-byte installation token without returning it", async () => {
  const token = token520();
  let observed;
  const transport = createOperatorGitHubReadonlyTransport({
    fetchImpl: async (url, options) => {
      observed = {
        url,
        method: options.method,
        authorization: options.headers.authorization,
        redirect: options.redirect,
      };
      return mockResponse(
        JSON.stringify({ login: "apidevelopers-digital" }),
        {
          "x-github-request-id": "REQ_123",
          "x-internal-secret": "discard",
        },
      );
    },
  });

  const result = await transport.requestWithCredential({
    request: {
      method: "GET",
      url: "https://api.github.com/orgs/apidevelopers-digital",
      timeoutMs: 5_000,
    },
    credential: {
      scheme: "bearer",
      bytes: Buffer.from(token, "utf8"),
    },
  });

  assert.equal(Buffer.byteLength(token), 520);
  assert.deepEqual(observed, {
    url: "https://api.github.com/orgs/apidevelopers-digital",
    method: "GET",
    authorization: `Bearer ${token}`,
    redirect: "error",
  });
  assert.equal(result.status, 200);
  assert.equal(result.headers["x-github-request-id"], "REQ_123");
  assert.equal(result.headers["x-internal-secret"], undefined);
  assert.equal(JSON.stringify(result).includes(token), false);
  assert.equal(transport.descriptor.credentialMaterialPersisted, false);
  assert.equal(transport.descriptor.productionChanged, false);
});

test("transport blocks writes, foreign origins and caller authorization", async () => {
  let calls = 0;
  const transport = createOperatorGitHubReadonlyTransport({
    fetchImpl: async () => {
      calls += 1;
      return mockResponse();
    },
  });
  const credential = {
    scheme: "bearer",
    bytes: Buffer.from("ghs_test", "utf8"),
  };

  for (const request of [
    {
      method: "POST",
      url: "https://api.github.com/orgs/apidevelopers-digital",
    },
    {
      method: "GET",
      url: "https://example.invalid/orgs/apidevelopers-digital",
    },
    {
      method: "GET",
      url: "https://api.github.com/orgs/apidevelopers-digital",
      headers: { authorization: "Bearer caller-controlled" },
    },
  ]) {
    await assert.rejects(
      () => transport.requestWithCredential({ request, credential }),
      (error) => error instanceof OperatorGitHubReadonlyTransportError,
    );
  }

  assert.equal(calls, 0);
});

test("transport rejects oversized responses and malformed credentials", async () => {
  const oversized = createOperatorGitHubReadonlyTransport({
    maxResponseBytes: 32,
    fetchImpl: async () => mockResponse("x".repeat(64)),
  });

  await assert.rejects(
    () =>
      oversized.requestWithCredential({
        request: {
          method: "GET",
          url: "https://api.github.com/orgs/apidevelopers-digital",
        },
        credential: {
          scheme: "bearer",
          bytes: Buffer.from("ghs_test", "utf8"),
        },
      }),
    (error) =>
      error instanceof OperatorGitHubReadonlyTransportError &&
      error.code === "github_transport_response_too_large",
  );

  const transport = createOperatorGitHubReadonlyTransport({
    fetchImpl: async () => mockResponse(),
  });
  for (const credential of [
    { scheme: "basic", bytes: Buffer.from("abc", "utf8") },
    { scheme: "bearer", bytes: Buffer.from("abc\nheader", "utf8") },
    { scheme: "bearer", bytes: new Uint8Array() },
  ]) {
    await assert.rejects(
      () =>
        transport.requestWithCredential({
          request: {
            method: "GET",
            url: "https://api.github.com/orgs/apidevelopers-digital",
          },
          credential,
        }),
      (error) =>
        error instanceof OperatorGitHubReadonlyTransportError &&
        error.code === "invalid_github_transport_credential",
    );
  }
});
