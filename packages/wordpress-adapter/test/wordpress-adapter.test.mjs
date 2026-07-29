import assert from "node:assert/strict";
import test from "node:test";

import {
  WordPressAdapterError,
  WordPressReadOnlyAdapter,
} from "../src/index.mjs";

function jsonResponse(payload, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

test("discover reads the public REST index without authentication", async () => {
  const requests = [];
  const adapter = new WordPressReadOnlyAdapter({
    baseUrl: "https://apidevelopers.digital/",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return jsonResponse({
        name: "API Developers.digital",
        url: "https://apidevelopers.digital",
        namespaces: ["wp/v2"],
        routes: {
          "/wp/v2": {},
          "/wp/v2/pages": {},
        },
      });
    },
  });

  const result = await adapter.discover();

  assert.equal(result.hasWpV2, true);
  assert.equal(resu["xasPagesRoute"], true);
  assert.equal(requests[0].options.method, "GET");
  assert.equal(requests[0].options.headers.authorization, undefined);
});

test("application password authentication validates user without logging credentials", async () => {
  const requests = [];
  const adapter = new WordPressReadOnlyAdapter({
    baseUrl: "https://example.test",
    auth: {
      type: "application-password",
      username: "factory",
      applicationPassword: "abcd efgh ijkl",
    },
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return jsonResponse({
        id: 7,
        slug: "factory",
        name: "Site Factory",
        roles: ["administrator"],
        capabilities: {
          edit_pages: true,
          publish_pages: true,
        },
      });
    },
  });

  const result = await adapter.validateAuthentication();

  assert.equal(result.validated, true);
  assert.equal(result.user.canEditPages, true);
  assert.match(requests[0].options.headers.authorization, /^Basic /);
  assert.equal(requests[0].url.includes("abcd"), false);
});

test("bearer authentication is supported for Hostinger-issued WordPress JWTs", async () => {
  let authorization;
  const adapter = new WordPressReadOnlyAdapter({
    baseUrl: "https://example.test",
    auth: { type: "bearer", token: "jwt-value" },
    fetchImpl: async (_url, options) => {
      authorization = options.headers.authorization;
      return jsonResponse({
        id: 1,
        roles: ["administrator"],
        capabilities: { manage_options: true },
      });
    },
  });

  const result = await adapter.validateAuthentication();

  assert.equal(authorization, "Bearer jwt-value");
  assert.equal(result.user.canPublishPages, true);
});

test("planPages generates create, update and noop operations without writes", () => {
  const adapter = new WordPressReadOnlyAdapter({
    baseUrl: "https://example.test",
    fetchImpl: async () => {
      throw new Error("network should not be used");
    },
  });

  const plan = adapter.planPages(
    [
      { slug: "inicio", title: "Início", status: "draft", content: "" },
      {
        slug: "instituicao",
        title: "Instituição",
        status: "draft",
        content: "Nova versão",
      },
      { slug: "contato", title: "Contato", status: "draft", content: "" },
    ],
    [
      {
        id: 6,
        slug: "inicio",
        title: "Início",
       status: "draft",
        content: "",
        template: null,
        menuOrder: 0,
      },
      {
        id: 9,
        slug: "instituicao",
        title: "Instituição antiga",
        status: "draft",
        content: "Versão antiga",
        template: null,
        menuOrder: 0,
      },
    ],
  );

  assert.equal(plan.writesEnabled, false);
  assert.deepEqual(plan.totals, { create: 1, update: 1, noop: 1 });
  assert.equal(plan.operations[0].action, "noop");
  assert.equal(plan.operations[1].action, "update");
  assert.equal(plan.operations[2].action, "create");
});

test("authenticated methods fail closed when credentials are absent", async () => {
  const adapter = new WordPressReadOnlyAdapter({
    baseUrl: "https://example.test",
    fetchImpl: async () => jsonResponse({}),
  });

  await assert.rejects(
    () => adapter.listPages(),
    (error) => {
      assert.ok(error instanceof WordPressAdapterError);
      assert.equal(error.code, "authentication_not_configured");
      return true;
    },
  );
});
