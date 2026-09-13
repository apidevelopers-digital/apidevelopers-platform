import assert from "node:assert/strict";
import test from "node:test";

import { resolveHostingerRuntimeEnv } from "../src/hostinger-runtime-env.mjs";

test("Hostinger runtime anchors the default state file under HOME when available", () => {
  const env = resolveHostingerRuntimeEnv({
    HOME: "/home/u-test",
    PORT: "3000",
  });

  assert.equal(env.HOST, "0.0.0.0");
  assert.equal(
    env.API_GATEWAY_STATE_FILE,
    "/home/u-test/.runtime/gateway-state.json",
  );
  assert.equal(env.PORT, "3000");
});

test("Hostinger runtime anchors an explicit relative state file under HOME", () => {
  const env = resolveHostingerRuntimeEnv({
    HOME: "/home/u-test",
    HOST: "127.0.0.1",
    API_GATEWAY_STATE_FILE: "state/custom.json",
    PORT: "4321",
  });

  assert.equal(env.HOST, "127.0.0.1");
  assert.equal(env.API_GATEWAY_STATE_FILE, "/home/u-test/state/custom.json");
  assert.equal(env.PORT, "4321");
});

test("Hostinger runtime preserves an explicit absolute state file", () => {
  const env = resolveHostingerRuntimeEnv({
    HOME: "/home/u-test",
    API_GATEWAY_STATE_FILE: "/srv/api-gateway/state.json",
  });

  assert.equal(env.API_GATEWAY_STATE_FILE, "/srv/api-gateway/state.json");
});

test("Hostinger runtime keeps the historical relative fallback when HOME is unavailable", () => {
  const env = resolveHostingerRuntimeEnv({ PORT: "3000" });

  assert.equal(env.API_GATEWAY_STATE_FILE, ".runtime/gateway-state.json");
});
