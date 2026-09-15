import test from "node:test";
import assert from "node:assert/strict";

import {
  createZuniChannelBindingReadonlyComposition,
  zuniChannelBindingReadonlyPath,
} from "../src/zuni-channel-binding-readonly-composition.mjs";

const AUTH = "Bearer zuni-channel-binding-reader-0123456789abcdef";
const TENANT = "component.tenant.acme";
const WORKSPACE = "component.workspace.acme.principal";

function baseApp() {
  return Object.freeze({
    async handleRequest(request = {}) {
      return Object.freeze({
        status: 299,
        headers: Object.freeze({ "content-type": "application/json" }),
        body: JSON.stringify({ delegated: true, url: request.url ?? "/" }),
      });
    },
  });
}

function fakeStore() {
  return Object.freeze({
    async read() {
      return {};
    },
    async transaction(work) {
      return typeof work === "function" ? work({}) : undefined;
    },
  });
}

function createComposition({ rows = [], authorization = AUTH } = {}) {
  const calls = [];
  const composition = createZuniChannelBindingReadonlyComposition({
    app: baseApp(),
    store: fakeStore(),
    consumerAuthorization: authorization,
    enabled: true,
    compareSecrets: (provided, expected) => provided === expected,
    saasRuntimeFactory: ({ store }) => Object.freeze({ store }),
    channelRuntimeFactory: ({ store, saasRuntime }) =>
      Object.freeze({
        async listChannelBindings(input) {
          calls.push({ input, store, saasRuntime });
          return rows;
        },
      }),
  });
  return { composition, calls };
}

async function request(composition, body, headers = { authorization: AUTH }) {
  const result = await composition.app.handleRequest({
    method: "POST",
    url: zuniChannelBindingReadonlyPath,
    headers,
    body: JSON.stringify(body),
  });
  return {
    ...result,
    json: JSON.parse(result.body),
  };
}

test("readonly composition is disabled unless explicitly enabled", () => {
  const app = baseApp();
  const composition = createZuniChannelBindingReadonlyComposition({
    app,
    enabled: false,
  });
  assert.equal(composition.enabled, false);
  assert.equal(composition.app, app);
  assert.equal(composition.descriptor.readOnly, true);
  assert.equal(composition.descriptor.writesEnabled, false);
  assert.equal(composition.descriptor.secretsReturned, false);
});

test("server-to-server authorization is mandatory", async () => {
  const { composition, calls } = createComposition();

  const result = await request(
    composition,
    { tenantId: TENANT, workspaceId: WORKSPACE },
    {},
  );

  assert.equal(result.status, 401);
  assert.equal(result.json.error, "zuni_channel_binding_reader_unauthorized");
  assert.equal(calls.length, 0);
});

test("lists only active bindings for the authoritative tenant/workspace scope", async () => {
  const rows = [
    {
      bindingId: "component.channel-binding.acme.principal.phone-123",
      tenantId: TENANT,
      workspaceId: WORKSPACE,
      productId: "zuni",
      provider: "meta",
      channelType: "whatsapp_business",
      channelId: "phone-123",
      wabaId: "waba-123",
      phoneNumberId: "phone-123",
      credentialRef: `cred_${"a".repeat(64)}`,
      status: "active",
      createdAt: "2026-09-15T05:00:00.000Z",
      updatedAt: "2026-09-15T05:00:00.000Z",
      accessToken: "must-never-leak",
      appSecret: "must-never-leak",
      internalNote: "must-never-leak",
    },
  ];
  const { composition, calls } = createComposition({ rows });

  const result = await request(composition, {
    tenantId: TENANT,
    workspaceId: WORKSPACE,
  });

  assert.equal(result.status, 200);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.resolved, true);
  assert.equal(result.json.count, 1);
  assert.equal(result.json.readOnly, true);
  assert.equal(result.json.writesExecuted, false);
  assert.equal(result.json.secretsReturned, false);
  assert.deepEqual(calls.map((entry) => entry.input), [
    {
      tenantId: TENANT,
      workspaceId: WORKSPACE,
      status: "active",
    },
  ]);
  assert.equal(result.json.bindings[0].credentialRef, `cred_${"a".repeat(64)}`);
  assert.equal("accessToken" in result.json.bindings[0], false);
  assert.equal("appSecret" in result.json.bindings[0], false);
  assert.equal("internalNote" in result.json.bindings[0], false);
  assert.equal(result.body.includes("must-never-leak"), false);
  assert.equal(result.headers["cache-control"], "no-store");
});

test("zero channels is returned as a valid empty state", async () => {
  const { composition } = createComposition({ rows: [] });
  const result = await request(composition, {
    tenantId: TENANT,
    workspaceId: WORKSPACE,
  });

  assert.equal(result.status, 200);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.resolved, false);
  assert.equal(result.json.count, 0);
  assert.deepEqual(result.json.bindings, []);
});

test("payload cannot choose status, credentialRef, bindingId, or channel", async () => {
  for (const injected of [
    { status: "disabled" },
    { credentialRef: `cred_${"b".repeat(64)}` },
    { bindingId: "component.channel-binding.other" },
    { channelId: "phone-other" },
    { accessToken: "synthetic-secret" },
  ]) {
    const { composition, calls } = createComposition();
    const result = await request(composition, {
      tenantId: TENANT,
      workspaceId: WORKSPACE,
      ...injected,
    });
    assert.equal(result.status, 400);
    assert.equal(
      result.json.error,
      "zuni_channel_binding_read_payload_invalid",
    );
    assert.equal(calls.length, 0);
  }
});

test("non-target requests are delegated to the existing gateway", async () => {
  const { composition } = createComposition();
  const result = await composition.app.handleRequest({
    method: "GET",
    url: "/health",
  });
  assert.equal(result.status, 299);
  assert.deepEqual(JSON.parse(result.body), {
    delegated: true,
    url: "/health",
  });
});

test("consumer authorization must be high entropy", () => {
  assert.throws(
    () =>
      createZuniChannelBindingReadonlyComposition({
        app: baseApp(),
        store: fakeStore(),
        consumerAuthorization: "short",
        enabled: true,
        compareSecrets: (provided, expected) => provided === expected,
        saasRuntimeFactory: ({ store }) => Object.freeze({ store }),
        channelRuntimeFactory: () =>
          Object.freeze({
            async listChannelBindings() {
              return [];
            },
          }),
      }),
    /at least 32 characters/,
  );
});
