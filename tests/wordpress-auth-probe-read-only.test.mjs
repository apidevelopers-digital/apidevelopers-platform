import test from "node:test";
import assert from "node:assert/strict";

import {
  createReadOnlyFetch,
  runWordPressAuthProbe,
} from "../scripts/wordpress-auth-probe.mjs";

const response = ({ payload, status = 200, headers = {} }) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {
    get(name) {
      return headers[String(name).toLowerCase()] ?? null;
    },
  },
  async text() {
    return JSON.stringify(payload);
  },
});

test("read-only fetch blocks every non-GET method", async () => {
  let called = false;
  const safeFetch = createReadOnlyFetch(async () => {
    called = true;
    return response({ payload: {} });
  });

  await assert.rejects(
    safeFetch("https://example.test/wp-json/wp/v2/pages", {
      method: "POST",
    }),
    (error) => error?.code === "non_read_only_method_blocked",
  );
  assert.equal(called, false);
});

test("probe uses GET only, requests id-only page data and sanitizes output", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method });

    return response({
      payload: [{ id: 987654 }],
      headers: {
        "x-wp-total": "7",
        "x-wp-totalpages": "7",
      },
    });
  };

  const adapterFactory = ({ fetchImpl: adapterFetch }) => ({
    async discover() {
      await adapterFetch("https://example.test/wp-json/", { method: "GET" });
      return {
        name: "Sensitive site name",
        url: "https://example.test",
        hasWpV2: true,
        hasPagesRoute: true,
      };
    },
    async validateAuthentication() {
      await adapterFetch(
        "https://example.test/wp-json/wp/v2/users/me?_fields=id,slug,roles",
        { method: "GET" },
      );
      return {
        validated: true,
        user: {
          id: 42,
          slug: "secret-user",
          roles: ["administrator"],
          canEditPages: true,
          canPublishPages: true,
        },
      };
    },
  });

  const result = await runWordPressAuthProbe({
    baseUrl: "https://example.test",
    username: "secret-user",
    applicationPassword: "secret-password",
    fetchImpl,
    adapterFactory,
  });

  assert.ok(calls.length >= 3);
  assert.ok(calls.every((call) => call.method === "GET"));

  const pageCall = calls.find((call) =>
    call.url.includes("/wp-json/wp/v2/pages"),
  );
  assert.ok(pageCall);
  const pageUrl = new URL(pageCall.url);
  assert.equal(pageUrl.searchParams.get("_fields"), "id");
  assert.equal(pageUrl.searchParams.get("per_page"), "1");
  assert.equal(pageUrl.searchParams.has("content"), false);
  assert.equal(pageUrl.searchParams.has("title"), false);

  assert.deepEqual(result, {
    ok: true,
    mode: "read-only",
    readyForApply: false,
    writesEnabled: false,
    discovery: {
      hasWpV2: true,
      hasPagesRoute: true,
    },
    authentication: {
      validated: true,
    },
    pages: {
      total: 7,
      totalPages: 7,
    },
  });

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("secret-user"), false);
  assert.equal(serialized.includes("administrator"), false);
  assert.equal(serialized.includes("987654"), false);
  assert.equal(serialized.includes("canPublishPages"), false);
});
