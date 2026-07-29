import assert from "node:assert/strict";
import test from "node:test";

import {
  HostingerAdapterError,
  HostingerReadOnlyAdapter,
} from "../src/index.mjs";

function jsonResponse(payload, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

test("inventoryDomain performs read-only Hostinger inventory and normalizes resources", async () => {
  const requests = [];
  const adapter = new HostingerReadOnlyAdapter({
    token: "secret-token",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (url.includes("/wordpress/installations")) {
        return jsonResponse([
          {
            id: "wp-123",
            username: "u123",
            domain: "https://apidevelopers.digital/",
            version: "7.0.2",
            valid: true,
          },
        ]);
      }
      return jsonResponse({
        data: [
          {
            uid: "website-1",
            state: "active",
            domains: [{ fqdn: "apidevelopers.digital" }],
            wordpress: {
              domain: "apidevelopers.digital",
              title: "API Developers.digital",
              language: "pt_BR",
            },
            user: { username: "u123" },
          },
        ],
        meta: { current_page: 1 },
      });
    },
  });

  const inventory = await adapter.inventoryDomain("APIDevelopers.digital.");

  assert.equal(inventory.domain, "apidevelopers.digital");
  assert.equal(inventory.found, true);
  assert.equal(inventory.wordpressReady, true);
  assert.equal(inventory.websites[0].username, "u123");
  assert.equal(inventory.wordpressInstallations[0].id, "wp-123");
  assert.equal(requests.length, 2);

  for (const request of requests) {
    assert.equal(request.options.method, "GET");
    assert.equal(request.options.headers.authorization, "Bearer secret-token");
    assert.equal(request.options.body, undefined);
  }
});

test("getWordPressInstallationJwtToken returns the token without placing it in URLs", async () => {
  let requestedUrl;
  const adapter = new HostingerReadOnlyAdapter({
    token: "hostinger-token",
    fetchImpl: async (url) => {
      requestedUrl = url;
      return jsonResponse({
        token: "wordpress-jwt",
        expires_at: "2026-07-29T21:00:00Z",
      });
    },
  });

  const result = await adapter.getWordPressInstallationJwtToken({
    username: "u 123",
    software: "wp/456",
  });

  assert.equal(result.token, "wordpress-jwt");
  assert.match(requestedUrl, /u%20123\/wordpress\/wp%2F456\/jwt-token$/);
  assert.equal(requestedUrl.includes("hostinger-token"), false);
});

test("HTTP errors preserve status and correlation ID without exposing bearer token", async () => {
  const adapter = new HostingerReadOnlyAdapter({
    token: "must-not-leak",
    fetchImpl: async () =>
      jsonResponse(
        { error: { message: "Unauthorized" }, correlation_id: "corr-1" },
        { status: 401 },
      ),
  });

  await assert.rejects(
    () => adapter.listWebsites(),
    (error) => {
      assert.ok(error instanceof HostingerAdapterError);
      assert.equal(error.status, 401);
      assert.equal(error.correlationId, "corr-1");
      assert.equal(error.message.includes("must-not-leak"), false);
      return true;
    },
  );
});
