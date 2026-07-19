import assert from "node:assert/strict";
import test from "node:test";
import {
  PlatformError,
  createJsonResponse,
  createRequestContext,
  normalizeError,
  toErrorResponse,
} from "../src/index.mjs";

test("request context normalizes method, URL, headers and request id", () => {
  const context = createRequestContext(
    {
      method: "post",
      url: "/v1/items?limit=10",
      headers: { "X-Request-ID": "request-123", "X-Test": "yes" },
      remoteAddress: "127.0.0.1",
    },
    { clock: () => "2026-07-19T12:00:00.000Z", idFactory: () => "fallback" },
  );

  assert.deepEqual(context, {
    requestId: "request-123",
    method: "POST",
    url: "/v1/items?limit=10",
    path: "/v1/items",
    query: { limit: "10" },
    headers: { "x-request-id": "request-123", "x-test": "yes" },
    remoteAddress: "127.0.0.1",
    receivedAt: "2026-07-19T12:00:00.000Z",
  });
});

test("invalid incoming request ids are replaced", () => {
  const context = createRequestContext(
    { requestId: "contains spaces" },
    { idFactory: () => "generated-id" },
  );
  assert.equal(context.requestId, "generated-id");
});

test("JSON and error responses share the same envelope", () => {
  const context = createRequestContext({}, { idFactory: () => "req-1" });
  const success = createJsonResponse(200, { data: { ok: true } }, context);
  const failure = toErrorResponse(
    new PlatformError("not_found", "Item not found.", { status: 404 }),
    context,
  );

  assert.equal(JSON.parse(success.body).requestId, "req-1");
  assert.deepEqual(JSON.parse(failure.body), {
    error: "not_found",
    message: "Item not found.",
    requestId: "req-1",
  });
  assert.equal(failure.headers["x-request-id"], "req-1");
});

test("internal errors do not expose their message", () => {
  assert.deepEqual(normalizeError(new Error("database password leaked")), {
    status: 500,
    code: "internal_error",
    message: "Unexpected platform error.",
    details: null,
  });
});
