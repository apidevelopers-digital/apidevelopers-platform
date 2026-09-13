import assert from "node:assert/strict";
import test from "node:test";

import { resolveHostingerRuntimeEnv } from "../src/hostinger-runtime-env.mjs";

test("Hostinger runtime anchors the default state file under HOME when available", () => {
  const env = resolveHostingerRuntimeEnv({
    HOME: "/home/u-test",
    PORT: "3000",
  }, {
    readFileFn() {
      throw new Error("missing");
    },
  });

  assert.equal(env.HOST, "0.0.0.0");
  assert.equal(
    env.API_GATEWAY_STATE_FILE,
    "/home/u-test/.runtime/gateway-state.json",
  );
  assert.equal(env.PORT, "3000");
  assert.equal(env.UNI_CO_PREVIEW_HANDOFF_REDEEMER_AUTHORIZATION, undefined);
  assert.equal(env.UNI_CO_PREVIEW_ACCESS_CONTEXT_AUTHORIZATION, undefined);
});

test("Hostinger runtime anchors an explicit relative state file under HOME", () => {
  const env = resolveHostingerRuntimeEnv({
    HOME: "/home/u-test",
    HOST: "127.0.0.1",
    API_GATEWAY_STATE_FILE: "state/custom.json",
    PORT: "4321",
  }, {
    readFileFn() {
      throw new Error("missing");
    },
  });

  assert.equal(env.HOST, "127.0.0.1");
  assert.equal(env.API_GATEWAY_STATE_FILE, "/home/u-test/state/custom.json");
  assert.equal(env.PORT, "4321");
});

test("Hostinger runtime preserves an explicit absolute state file", () => {
  const env = resolveHostingerRuntimeEnv({
    HOME: "/home/u-test",
    API_GATEWAY_STATE_FILE: "/srv/api-gateway/state.json",
  }, {
    readFileFn() {
      throw new Error("missing");
    },
  });

  assert.equal(env.API_GATEWAY_STATE_FILE, "/srv/api-gateway/state.json");
});

test("Hostinger runtime keeps the historical relative fallback when HOME is unavailable", () => {
  const env = resolveHostingerRuntimeEnv({ PORT: "3000" }, {
    readFileFn() {
      throw new Error("missing");
    },
  });

  assert.equal(env.API_GATEWAY_STATE_FILE, ".runtime/gateway-state.json");
});

test("Hostinger runtime loads Uni account preview S2S credentials from the private runtime file", () => {
  const env = resolveHostingerRuntimeEnv({
    HOME: "/home/u-test",
    PORT: "3000",
  }, {
    readFileFn(path, encoding) {
      assert.equal(
        path,
        "/home/u-test/domains/apidevelopers.digital/uni-preview-account-runtime/gateway.credentials.json",
      );
      assert.equal(encoding, "utf8");
      return JSON.stringify({
        handoffRedeemerAuthorization: `Bearer ${"H".repeat(64)}`,
        accessContextAuthorization: `Bearer ${"A".repeat(64)}`,
      });
    },
  });

  assert.equal(env.UNI_CO_PREVIEW_HANDOFF_REDEEMER_AUTHORIZATION, `Bearer ${"H".repeat(64)}`);
  assert.equal(env.UNI_CO_PREVIEW_ACCESS_CONTEXT_AUTHORIZATION, `Bearer ${"A".repeat(64)}`);
});

test("Hostinger runtime explicit env credentials win over private file reads", () => {
  let reads = 0;
  const env = resolveHostingerRuntimeEnv({
    HOME: "/home/u-test",
    UNI_CO_PREVIEW_HANDOFF_REDEEMER_AUTHORIZATION: `Bearer ${"E".repeat(64)}`,
    UNI_CO_PREVIEW_ACCESS_CONTEXT_AUTHORIZATION: `Bearer ${"C".repeat(64)}`,
  }, {
    readFileFn() {
      reads += 1;
      throw new Error("must not read");
    },
  });

  assert.equal(reads, 0);
  assert.equal(env.UNI_CO_PREVIEW_HANDOFF_REDEEMER_AUTHORIZATION, `Bearer ${"E".repeat(64)}`);
  assert.equal(env.UNI_CO_PREVIEW_ACCESS_CONTEXT_AUTHORIZATION, `Bearer ${"C".repeat(64)}`);
});
