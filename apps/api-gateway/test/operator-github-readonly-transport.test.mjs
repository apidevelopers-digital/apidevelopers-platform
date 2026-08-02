import assert from "node:assert/strict";
import test from "node:test";

import {
  OperatorGitHubReadonlyTransportError,
  createOperatorGitHubReadonlyTransport,
} from "../src/operator-github-readonly-transport.mjs";

function syntheticInstallationToken(length = 520) {
  const prefix = "ghs_";
  return prefix + "A".repeat(length - prefix.length);
}

function response({
  status = 200,
  body = "{}",
  headers = {},
} = {}) {
  const encoded = Buffer.from(body, "utf8");
  const normalizedHeaders = new Map(
    Object.entries(x
      "content-length": String(encoded.byteLength),
      ...headers,
    }).map(([key, value]) => [key.toLowerCase(), String(value)]),
  );

  return {
    status,
    headers: {
      get(name) {
        return normalizedHeaders.get(String(name).toLowerCase()) ?? null;
      },
    },
    async arrayBuffer() {
      return encoded;
    },
  };
}

test("readonly transport carries a 520-byte stateless installation token without returning it", async () => {
  const token = syntheticInstallationToken();
  const tokenBytes = Buffer.from(token, "utf8");
  let observed;

  const transport = createOperatorGitHubReadonlyTransport({
    fetchImpl: async (url, options) => {
      observed = {
        url,
        method: options.method,
        authorization: options.headers.authorization,
        accept: options.headers.accept,
        redirect: options.redirect,
      };

      return response({
        body: JSON.stringify({
          login: "apidevelopers-digital",
          token: "must-not-be-returned",
        }),
        headers: {
          link: '<https://api.github.com/orgs/apidevelopers-digital/repos?page=2>; rel="next"',
          "x-github-request-id": "REQ_123",
          "x-internal-secret": "discard-me",
        },
      });
    },
  });

  const result = await transport.requestWithCredential({
    request: {
      method: "GET",
      url: "https://api.github.com/orgs/apidevelopers-digital",
      headers: {
        accept: "application/vnd.github+json",
      },
      timeoutMs: 5_000,
    },
    credential: {
      scheme: "bearer",
      bytes: tokenBytes,
      version: "synthetic-stateless-v1",
    },
  });

  assert.equal(tokenBytes.byteLength, 520);
  assert.deepEqual(observed, {
    url: "https://api.github.com/orgs/apidevelopers-digital",
    method: "GET",
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    redirect: "error",
  });
  assert.equal(result.status, 200);
  assert.equal(result.headers["x-github-request-id"], "REQ_123");
  assert.equal(result.headers["x-internal-secret"], undefined);
  assert.equal(JSON.stringify(result).includes(token), false);
  assert.equal(transport.descriptor.credentialMaterialPersisted, false);
  assert.equal(transport.descriptor.rawResponseHeadersReturned, false);
  assert.equal(transport.descriptor.productionChanged, false);
});

test("readonly transport blocks non-GET requests and destinations outside the allowlist", async () => {
  let calls = 0;
  const transport = createOperatorGitHubReadonlyTransport({
    fetchImpl: async () => {
      calls += 1;
      return response();
    },
  });

  await assert.rejects(
    () =>
      transport.requestWithCredential({
        request: {
          method: "POST",
          url: "https://api.github.com/orgs/apidevelopers-digital",
        },
        credential: {
          scheme: "bearer",
          bytes: Buffer.from("ghs_test", "utf8"),
        },
      }),
    (error) =>
      error instanceof OperatorGitHubReadonlyTransportError &&
      error.code === "github_transport_method_forbidden",
  );

  await assert.rejects(
    () =>
      transport.requestWithCredential({
        request: {
          method: "GET",
          url: "https://example.invalid/orgs/apidevelopers-digital",
        },
        credential: {
          scheme: "bearer",
          bytes: Buffer.from("ghs_test", "utf8"),
        },
      }),
    (error) =>
      error instanceof OperatorGitHubReadonlyTransportError &&
      error.code === "github_transport_destination_forbidden",
  );

  assert.equal(calls, 0);
});

test("readonly transport refuses caller supplied authorization and oversized responses", async () => {
  const transport = createOperatorGitHubReadonlyTransport({
    maxResponseBytes: 32,
    fetchImpl: async () =>
      response({
        body: "x".repeat(64),
      }),
  });

  await assert.rejects(
    () =>
      transport.requestWithCredential({
        request: {
          method: "GET",
          url: "https://api.github.com/orgs/apidevelopers-digital",
          headers: {
            authorization: "Bearer caller-controlled",
          },
        },
        credential: {
          scheme: "bearer",
          bytes: Buffer.from("ghs_test", "utf8"),
        },
      }),
    (error) =>
      error instanceof OperatorGitHubReadonlyTransportError &&
      error.code === "forbidden_github_transport_header",
  );

  await assert.rejects(
    () =>
      transport.requestWithCredential({
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
});

test("readonly transport requires visible opaque bearer bytes", async () => {
  const transport = createOperatorGitHubReadonlyTransport({
    fetchImpl: async () => response(),
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
