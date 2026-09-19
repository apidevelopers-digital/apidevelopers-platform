import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  attachZuniChannelBindingWriteHostingerComposition,
  ZUNI_CHANNEL_BINDING_WRITE_API_ENABLED_ENV,
  ZUNI_CHANNEL_BINDING_WRITE_AUTHORIZATION_ENV,
} from "../src/zuni-channel-binding-write-hostinger-wiring.mjs";

const AUTH = "Bearer zuni-binding-writer-0123456789abcdef";

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

test("Hostinger Channel Binding write wiring is disabled by default", async () => {
  const gateway = Object.freeze({ app });
  const wired = attachZuniChannelBindingWriteHostingerComposition({
    gateway,
    env: {},
  });

  assert.equal(wired.app, app);
  assert.equal(wired.zuniChannelBindingWrite.enabled, false);
  assert.equal(wired.zuniChannelBindingWrite.runtimeAutoWiring, true);
  assert.equal(wired.zuniChannelBindingWrite.productionChanged, false);
  assert.equal(wired.zuniChannelBindingWrite.secretsReturned, false);
});

test("enabling Hostinger wiring requires the durable store and high-entropy S2S authorization", () => {
  assert.throws(
    () =>
      attachZuniChannelBindingWriteHostingerComposition({
        gateway: { app },
        env: { [ZUNI_CHANNEL_BINDING_WRITE_API_ENABLED_ENV]: "true" },
      }),
    /gateway\.store must provide read and transaction/,
  );

  assert.throws(
    () =>
      attachZuniChannelBindingWriteHostingerComposition({
        gateway: { app, store },
        env: { [ZUNI_CHANNEL_BINDING_WRITE_API_ENABLED_ENV]: "true" },
      }),
    new RegExp(`${ZUNI_CHANNEL_BINDING_WRITE_AUTHORIZATION_ENV} is required`),
  );

  assert.throws(
    () =>
      attachZuniChannelBindingWriteHostingerComposition({
        gateway: { app, store },
        env: {
          [ZUNI_CHANNEL_BINDING_WRITE_API_ENABLED_ENV]: "true",
          [ZUNI_CHANNEL_BINDING_WRITE_AUTHORIZATION_ENV]: "short",
        },
      }),
    /at least 32 characters/,
  );
});

test("enabled Hostinger wiring mounts the governed write composition and never exposes the S2S secret", async () => {
  const wired = attachZuniChannelBindingWriteHostingerComposition({
    gateway: { app, store },
    env: {
      [ZUNI_CHANNEL_BINDING_WRITE_API_ENABLED_ENV]: "true",
      [ZUNI_CHANNEL_BINDING_WRITE_AUTHORIZATION_ENV]: AUTH,
    },
  });

  assert.notEqual(wired.app, app);
  assert.equal(wired.zuniChannelBindingWrite.enabled, true);
  assert.equal(wired.zuniChannelBindingWrite.runtimeAutoWiring, true);
  assert.equal(
    wired.zuniChannelBindingWrite.path,
    "/v1/zuni/channel-bindings/register",
  );
  assert.equal(wired.zuniChannelBindingWrite.secretsReturned, false);
  assert.equal(JSON.stringify(wired).includes(AUTH), false);

  const delegated = await wired.app.handleRequest({
    method: "GET",
    url: "/health",
  });
  assert.equal(delegated.status, 299);

  const unauthorized = await wired.app.handleRequest({
    method: "POST",
    url: "/v1/zuni/channel-bindings/register",
    headers: {},
    body: JSON.stringify({}),
  });
  assert.equal(unauthorized.status, 401);
  assert.equal(JSON.parse(unauthorized.body).bindingWriteExecuted, false);
});

test("Hostinger entry attaches the Zuni Channel Binding write wiring", () => {
  const source = fs.readFileSync(
    new URL("../src/hostinger-entry.mjs", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /attachZuniChannelBindingWriteHostingerComposition/,
  );
  assert.match(
    source,
    /gateway:\s*uniJuriGateway/,
  );
});
