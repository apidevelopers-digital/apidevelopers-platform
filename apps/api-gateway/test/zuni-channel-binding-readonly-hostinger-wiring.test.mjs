import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  attachZuniChannelBindingReadonlyHostingerComposition,
  ZUNI_CHANNEL_BINDING_READONLY_API_ENABLED_ENV,
  ZUNI_CHANNEL_BINDING_READ_AUTHORIZATION_ENV,
} from "../src/zuni-channel-binding-readonly-hostinger-wiring.mjs";

const AUTH = "Bearer zuni-binding-reader-0123456789abcdef";

const app = Object.freeze({
  async handleRequest(request = {}) {
    return Object.freeze({
      status: 299,
      headers: Object.freeze({}),
      body: JSON.stringify({ delegated: true, url: request.url ?? "/" }),
    });
  },
});

const store = Object.freeze({
  async read() {
    return {};
  },
  async transaction(work) {
    return typeof work === "function" ? work({}) : undefined;
  },
});

test("Hostinger Channel Binding readonly wiring is disabled by default", () => {
  const gateway = Object.freeze({ app });
  const wired = attachZuniChannelBindingReadonlyHostingerComposition({
    gateway,
    env: {},
  });

  assert.equal(wired.app, app);
  assert.equal(wired.zuniChannelBindingReadonly.enabled, false);
  assert.equal(wired.zuniChannelBindingReadonly.runtimeAutoWiring, true);
  assert.equal(wired.zuniChannelBindingReadonly.readOnly, true);
  assert.equal(wired.zuniChannelBindingReadonly.writesEnabled, false);
  assert.equal(wired.zuniChannelBindingReadonly.productionChanged, false);
  assert.equal(wired.zuniChannelBindingReadonly.secretsReturned, false);
});

test("enabling readonly Hostinger wiring requires durable store and high-entropy S2S authorization", () => {
  assert.throws(
    () =>
      attachZuniChannelBindingReadonlyHostingerComposition({
        gateway: { app },
        env: { [ZUNI_CHANNEL_BINDING_READONLY_API_ENABLED_ENV]: "true" },
      }),
    /gateway\.store must provide read and transaction/,
  );

  assert.throws(
    () =>
      attachZuniChannelBindingReadonlyHostingerComposition({
        gateway: { app, store },
        env: { [ZUNI_CHANNEL_BINDING_READONLY_API_ENABLED_ENV]: "true" },
      }),
    new RegExp(`${ZUNI_CHANNEL_BINDING_READ_AUTHORIZATION_ENV} is required`),
  );

  assert.throws(
    () =>
      attachZuniChannelBindingReadonlyHostingerComposition({
        gateway: { app, store },
        env: {
          [ZUNI_CHANNEL_BINDING_READONLY_API_ENABLED_ENV]: "true",
          [ZUNI_CHANNEL_BINDING_READ_AUTHORIZATION_ENV]: "short",
        },
      }),
    /at least 32 characters/,
  );
});

test("enabled readonly Hostinger wiring mounts governed read composition without exposing S2S authorization", async () => {
  const wired = attachZuniChannelBindingReadonlyHostingerComposition({
    gateway: { app, store },
    env: {
      [ZUNI_CHANNEL_BINDING_READONLY_API_ENABLED_ENV]: "true",
      [ZUNI_CHANNEL_BINDING_READ_AUTHORIZATION_ENV]: AUTH,
    },
  });

  assert.notEqual(wired.app, app);
  assert.equal(wired.zuniChannelBindingReadonly.enabled, true);
  assert.equal(wired.zuniChannelBindingReadonly.runtimeAutoWiring, true);
  assert.equal(wired.zuniChannelBindingReadonly.path, "/v1/zuni/channel-bindings/resolve");
  assert.equal(wired.zuniChannelBindingReadonly.readOnly, true);
  assert.equal(wired.zuniChannelBindingReadonly.writesEnabled, false);
  assert.equal(wired.zuniChannelBindingReadonly.secretsReturned, false);
  assert.equal(JSON.stringify(wired).includes(AUTH), false);

  const unauthorized = await wired.app.handleRequest({
    method: "POST",
    url: "/v1/zuni/channel-bindings/resolve",
    headers: {},
    body: JSON.stringify({
      tenantId: "component.tenant.acme",
      workspaceId: "component.workspace.acme.main",
    }),
  });
  assert.equal(unauthorized.status, 401);
  assert.equal(JSON.parse(unauthorized.body).resolved, false);
});

test("Hostinger entry attaches readonly wiring after existing write wiring", () => {
  const source = fs.readFileSync(
    new URL("../src/hostinger-entry.mjs", import.meta.url),
    "utf8",
  );
  assert.match(source, /attachZuniChannelBindingReadonlyHostingerComposition/);
  assert.match(source, /const zuniWriteGateway = attachZuniChannelBindingWriteHostingerComposition/);
  assert.match(source, /gateway:\s*zuniWriteGateway/);
});
