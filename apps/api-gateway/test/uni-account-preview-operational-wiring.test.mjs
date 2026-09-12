import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createJsonFileStore } from "@apidevelopers/persistence-core";

import { createOperationalRuntime } from "../src/operational-runtime.mjs";
import { createUniAccountPreviewRuntimeComposition } from "../src/uni-account-preview-runtime-composition.mjs";

function app(name) {
  return Object.freeze({
    name,
    async handleRequest() {
      return Object.freeze({
        status: 404,
        headers: Object.freeze({}),
        body: "{}",
      });
    },
  });
}

function githubRuntimeDisabled() {
  return Object.freeze({
    configured: false,
    client: undefined,
    organization: undefined,
    descriptor: Object.freeze({
      configured: false,
      mode: "deny-by-default",
      reason: "github_readonly_not_configured",
      productionChanged: false,
    }),
  });
}

function baseGateway(baseApp, store) {
  return Object.freeze({
    app: baseApp,
    readiness: Object.freeze({}),
    store,
  });
}

function loginComposition(loginApp) {
  return Object.freeze({
    enabled: true,
    app: loginApp,
    bootstrap: Object.freeze({ async login() {} }),
    descriptor: Object.freeze({
      enabled: true,
      mode: "preview-assisted",
    }),
  });
}

async function withEnabledAccountRuntime(assertion) {
  const directory = await mkdtemp(join(tmpdir(), "uni-account-runtime-wiring-"));
  try {
    const store = createJsonFileStore({
      filePath: join(directory, "state.json"),
      fsync: false,
    });
    const composition = createUniAccountPreviewRuntimeComposition({
      app: app("base"),
      store,
      loginBootstrap: Object.freeze({ async login() {} }),
      redeemerAuthorization: `Bearer ${"R".repeat(48)}`,
      enabled: true,
    });
    await assertion(composition);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("operational runtime keeps account handoff disabled without dedicated redeemer auth", () => {
  const baseApp = app("base");
  const loginApp = app("login");
  const store = Object.freeze({ marker: "store" });
  let accountInput;

  const runtime = createOperationalRuntime({
    cwd: "/tmp/uni-operational",
    env: {
      API_GATEWAY_STATE_FILE: "state.json",
      UNI_CO_PREVIEW_IDENTITY_BACKEND_BASE_URL: "https://identity.example.test",
    },
    gatewayFactory() {
      return baseGateway(baseApp, store);
    },
    previewLoginCompositionFactory(input) {
      assert.equal(input.app, baseApp);
      assert.equal(input.store, store);
      return loginComposition(loginApp);
    },
    previewAccountRuntimeCompositionFactory(input) {
      accountInput = input;
      return Object.freeze({
        enabled: false,
        app: input.app,
        descriptor: Object.freeze({
          mode: "preview-only",
          redeemerConfigured: false,
          runtimeAutoWiring: false,
        }),
      });
    },
    githubRuntimeFactory: githubRuntimeDisabled,
  });

  assert.equal(accountInput.enabled, false);
  assert.equal(accountInput.redeemerAuthorization, undefined);
  assert.equal(accountInput.app, loginApp);
  assert.equal(accountInput.store, store);
  assert.equal(typeof accountInput.loginBootstrap.login, "function");
  assert.equal(runtime.app, loginApp);
  assert.equal(runtime.descriptor.uniAccountPreviewHandoff.redeemerConfigured, false);
  assert.equal(runtime.descriptor.uniAccountPreviewHandoff.runtimeAutoWiring, false);
});

test("operational runtime mounts account handoff only with dedicated redeemer auth and does not expose the secret", () => {
  const baseApp = app("base");
  const loginApp = app("login");
  const handoffApp = app("handoff");
  const store = Object.freeze({ marker: "store" });
  const authorization = `Bearer ${"R".repeat(48)}`;
  let transformedApp;

  const runtime = createOperationalRuntime({
    cwd: "/tmp/uni-operational",
    env: {
      API_GATEWAY_STATE_FILE: "state.json",
      UNI_CO_PREVIEW_IDENTITY_BACKEND_BASE_URL: "https://identity.example.test",
      UNI_CO_PREVIEW_HANDOFF_REDEEMER_AUTHORIZATION: authorization,
    },
    gatewayFactory() {
      return baseGateway(baseApp, store);
    },
    previewLoginCompositionFactory() {
      return loginComposition(loginApp);
    },
    previewAccountRuntimeCompositionFactory(input) {
      accountInput = input;
      assert.equal(input.app, loginApp);
      assert.equal(input.store, store);
      assert.equal(input.enabled, true);
      assert.equal(input.redeemerAuthorization, authorization);
      assert.equal(typeof input.loginBootstrap.login, "function");
      return Object.freeze({
        enabled: true,
        app: handoffApp,
        descriptor: Object.freeze({
          mode: "preview-only",
          productionEnabled: false,
          redeemerConfigured: true,
          runtimeAutoWiring: true,
        }),
      });
    },
    gatewayTransform({ gateway }) {
      transformedApp = gateway.app;
      return gateway;
    },
    githubRuntimeFactory: githubRuntimeDisabled,
  });

  assert.equal(transformedApp, handoffApp);
  assert.equal(runtime.app, handoffApp);
  assert.equal(runtime.descriptor.uniAccountPreviewHandoff.runtimeAutoWiring, true);
  assert.equal(runtime.descriptor.uniAccountPreviewHandoff.redeemerConfigured, true);
  assert.equal(JSON.stringify(runtime.descriptor).includes(authorization), false);
});

test("enabled account runtime reports enabled=true", async () => {
  await withEnabledAccountRuntime(async (composition) => {
    assert.equal(composition.enabled, true);
  });
});

test("enabled account runtime exposes authorize-facing issue service", async () => {
  await withEnabledAccountRuntime(async (composition) => {
    assert.equal(typeof composition.handoffService?.issue, "function");
  });
});

test("enabled account runtime marks runtime auto-wiring", async () => {
  await withEnabledAccountRuntime(async (composition) => {
    assert.equal(composition.descriptor.runtimeAutoWiring, true);
  });
});

test("enabled account runtime marks redeemer configured", async () => {
  await withEnabledAccountRuntime(async (composition) => {
    assert.equal(composition.descriptor.redeemerConfigured, true);
  });
});

test("enabled account runtime remains preview-only", async () => {
  await withEnabledAccountRuntime(async (composition) => {
    assert.equal(composition.descriptor.productionEnabled, false);
  });
});
