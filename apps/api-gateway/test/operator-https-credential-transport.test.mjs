import assert from "node:assert/strict";
import test from "node:test";

import {
  OperatorHttpsEgressPolicyError,
  createOperatorHttpsEgressPolicy,
} from "../src/operator-https-egress-policy.mjs";
import {
  OperatorHttpsCredentialTransportError,
  createOperatorHttpsCredentialTransport,
  createUnavailableOperatorHttpsCredentialTransport,
} from "../src/operator-https-credential-transport.mjs";

function response({
  status = 200,
  body = "{}",
  headers = {},
} = {}) {
  return new Response(body, { status, headers });
}

const policy = createOperatorHttpsEgressPolicy({
  allowedHosts: ["api.github.com"],
  allowedPathPrefixes: ["/orgs/", "/repos/"],
});

test("egress policy allows bounded GitHub GET metadata request", () => {
  const value = policy.authorize({
    method: "GET",
    url: "https://api.github.com/orgs/apidevelopers-digital/repos?type=all&page=2&per_page=50",
    headers: {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "api-developers-operator-gateway/0.1",
    },
    timeoutMs: 10_000,
  });

  assert.equal(value.method, "GET");
  assert.equal(new URL(value.url).hostname, "api.github.com");
  assert.equal(value.timeoutMs, 10_000);
  assert.equal("authorization" in value.headers, false);
});

test("egress policy denies SSRF, writes, credentials and unknown query/header", () => {
  const cases = [
    { method: "GET", url: "http://api.github.com/orgs/x" },
    { method: "GET", url: "https://127.0.0.1/orgs/x" },
    { method: "GET", url: "https://user:pass@api.github.com/orgs/x" },
    { method: "GET", url: "https://api.github.com:444/orgs/x" },
    { method: "POST", url: "https://api.github.com/orgs/x" },
    { method: "GET", url: "https://api.github.com/orgs/x?token=secret" },
    {
      method: "GET",
      url: "https://api.github.com/orgs/x",
      headers: { authorization: "Bearer forbidden" },
    },
    {
      method: "GET",
      url: "https://api.github.com/orgs/x",
      body: "{}",
    },
  ];

  for (const request of cases) {
    assert.throws(
      () => policy.authorize(request),
      (error) => error instanceof OperatorHttpsEgressPolicyError,
    );
  }
});

test("credential transport injects bearer only inside fetch and sanitizes response", async () => {
  const calls = [];
  const transport = createOperatorHttpsCredentialTransport({
    policy,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return response({
        status: 200,
        body: JSON.stringify({ login: "apidevelopers-digital" }),
        headers: {
          link: '<https://api.github.com/orgs/apidevelopers-digital/repos?page=2>; rel="next"',
          "x-ratelimit-remaining": "4999",
          "set-cookie": "forbidden=1",
          "x-private-upstream": "forbidden",
        },
      });
    },
  });

  const credential = Buffer.from("test-only-token");
  const value = await transport.requestWithCredential({
    request: {
      method: "GET",
      url: "https://api.github.com/orgs/apidevelopers-digital",
      headers: {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "api-developers-operator-gateway/0.1",
      },
      timeoutMs: 1000,
    },
    credential: { scheme: "bearer", bytes: credential },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.headers.authorization, "Bearer test-only-token");
  assert.equal(calls[0].init.redirect, "error");
  assert.equal(calls[0].init.credentials, "omit");
  assert.equal(value.status, 200);
  assert.equal(value.headers["x-ratelimit-remaining"], "4999");
  assert.equal("set-cookie" in value.headers, false);
  assert.equal("x-private-upstream" in value.headers, false);
  assert.equal(JSON.parse(value.body).login, "apidevelopers-digital");
  assert.equal(credential.toString(), "test-only-token");
});

test("credential transport denies redirects and oversized responses", async () => {
  const redirecting = createOperatorHttpsCredentialTransport({
    policy,
    fetchImpl: async () => response({ status: 302, headers: { location: "https://evil.invalid" } }),
  });
  await assert.rejects(
    redirecting.requestWithCredential({
      request: {
        method: "GET",
        url: "https://api.github.com/orgs/apidevelopers-digital",
      },
      credential: { scheme: "bearer", bytes: Buffer.from("test-token") },
    }),
    (error) =>
      error instanceof OperatorHttpsCredentialTransportError &&
      error.code === "redirect_denied" &&
      error.status === 502,
  );

  const oversized = createOperatorHttpsCredentialTransport({
    policy,
    maxResponseBytes: 1024,
    fetchImpl: async () => response({ body: "x".repeat(2048) }),
  });
  await assert.rejects(
    oversized.requestWithCredential({
      request: {
        method: "GET",
        url: "https://api.github.com/orgs/apidevelopers-digital",
      },
      credential: { scheme: "bearer", bytes: Buffer.from("test-token") },
    }),
    (error) =>
      error instanceof OperatorHttpsCredentialTransportError &&
      error.code === "response_too_large",
  );
});

test("credential transport sanitizes timeout and network failures", async () => {
  const unavailable = createOperatorHttpsCredentialTransport({
    policy,
    fetchImpl: async () => {
      throw new Error("network secret detail");
    },
  });

  await assert.rejects(
    unavailable.requestWithCredential({
      request: {
        method: "GET",
        url: "https://api.github.com/orgs/apidevelopers-digital",
      },
      credential: { scheme: "bearer", bytes: Buffer.from("test-token") },
    }),
    (error) =>
      error instanceof OperatorHttpsCredentialTransportError &&
      error.code === "https_transport_unavailable" &&
      !error.message.includes("network secret detail"),
  );
});

test("unavailable transport fails closed without network", async () => {
  await assert.rejects(
    createUnavailableOperatorHttpsCredentialTransport().requestWithCredential(),
    (error) =>
      error instanceof OperatorHttpsCredentialTransportError &&
      error.code === "https_transport_unavailable" &&
      error.status === 503,
  );
});
