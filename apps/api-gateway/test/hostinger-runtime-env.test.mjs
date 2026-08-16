import assert from "node:assert/strict";
import test from "node:test";

import { resolveHostingerRuntimeEnv } from "../src/hostinger-runtime-env.mjs";

test("Hostinger runtime defaults bind publicly and provide a writable state path", () => {
  const env = resolveHostingerRuntimeEnv({ PORT: "3000" });

  assert.equal(env.HOST, "0.0.0.0");
  assert.equal(env.API_GATEWAY_STATE_FILE, ".runtime/gateway-state.json");
  assert.equal(env.PORT, "3000");
});

test("Hostinger runtime preserves explicit host and state file configuration", () => {
  const env = resolveHostingerRuntimeEnv({
    HOST: "127.0.0.1",
    API_GATEWAY_STATE_FILE: "state/custom.json",
    PORT: "4321",
  });

  assert.equal(env.HOST, "127.0.0.1");
  assert.equal(env.API_GATEWAY_STATE_FILE, "state/custom.json");
  assert.equal(env.PORT, "4321");
});
