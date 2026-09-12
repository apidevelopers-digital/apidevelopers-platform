import assert from "node:assert/strict";
import test from "node:test";

import { createOperationalRuntime } from "../src/operational-runtime.mjs";

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

test("operational runtime keeps access-context disabled without dedicated consumer auth", () => {
  const baseApp = app("base");
  const loginApp = app("login");
  const store = Object.freeze({ marker: "store" });
  let accessInput;

  const runtime = createOperationalRuntime({
    cwd: "/tmp/uni-operational",
    env: {
      API_GATEWAY_STATE_FILE: "state.json",
      UNI_CO_PREVIEW_IDENTITY_BACKEND_BASE_URL: "https://identity.example.test",
    },
    gatewayFactory() {
      return baseGateway(baseApp, store);
    },
    previewLoginCompositionFactory() {
      return loginComposition(loginApp);
    },
    previewAccountRuntimeCompositionFactory(input) {
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
    previewAccountAccessContextRuntimeCompositionFactory(input) {
      accessInput = input;
      return Object.freeze({
        enabled: false,
        app: input.app,
        descriptor: Object.freeze({
          mode: "preview-only",
          productionEnabled: false,
          consumerConfigured: false,
          runtimeAutoWiring: false,
        }),
      });
    },
    githubRuntimeFactory: githubRuntimeDisabled,
  });

  assert.equal(accessInput.app, loginApp);
  assert.equal(accessInput.store, store);
  assert.equal(accessInput.enabled, false);
  assert.equal(accessInput.consumerAuthorization, undefined);
  assert.equal(runtime.app, loginApp);
  assert.equal(
    runtime.descriptor.uniAccountPreviewAccessContext.consumerConfigured,
    false,
  );
  assert.equal(
    runtime.descriptor.uniAccountPreviewAccessContext.runtimeAutoWiring,
    false,
  );
});

test("operational runtime mounts access-context after handoff and does not expose dedicated auth", () => {
  const baseApp = app("base");
  const loginApp = app("login");
  const handoffApp = app("handoff");
  const accessContextApp = app("access-context");
  const store = Object.freeze({ marker: "store" });
  const handoffAuthorization = `Bearer ${"H".repeat(48)}`;
  const accessContextAuthorization = `Bearer ${"A".repeat(48)}`;
  let transformedApp;

  const runtime = createOperationalRuntime({
    cwd: "/tmp/uni-operational",
    env: {
      API_GATEWAY_STATE_FILE: "state.json",
      UNI_CO_PREVIEW_IDENTITY_BACKEND_BASE_URL: "https://identity.example.test",
      UNI_CO_PREVIEW_HANDOFF_REDEEMER_AUTHORIZATION: handoffAuthorization,
      UNI_CO_PREVIEW_ACCESS_CONTEXT_AUTHORIZATION: accessContextAuthorization,
    },
    gatewayFactory() {
      return baseGateway(baseApp, store);
    },
    previewLoginCompositionFactory() {
      return loginComposition(loginApp);
    },
    previewAccountRuntimeCompositionFactory(input) {
      assert.equal(input.app, loginApp);
      assert.equal(input.store, store);
      assert.equal(input.redeemerAuthorization, handoffAuthorization);
      assert.equal(input.enabled, true);
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
    previewAccountAccessContextRuntimeCompositionFactory(input) {
      assert.equal(input.app, handoffApp);
      assert.equal(input.store, store);
      assert.equal(input.consumerAuthorization, accessContextAuthorization);
      assert.equal(input.enabled, true);
      return Object.freeze({
        enabled: true,
        app: accessContextApp,
        descriptor: Object.freeze({
          mode: "preview-only",
          productionEnabled: false,
          consumerConfigured: true,
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

  assert.equal(transformedApp, accessContextApp);
  assert.equal(runtime.app, accessContextApp);
  assert.equal(runtime.descriptor.uniAccountPreviewHandoff.runtimeAutoWiring, true);
  assert.equal(
    runtime.descriptor.uniAccountPreviewAccessContext.runtimeAutoWiring,
    true,
  );
  assert.equal(
    runtime.descriptor.uniAccountPreviewAccessContext.consumerConfigured,
    true,
  );
  assert.equal(
    runtime.descriptor.uniAccountPreviewAccessContext.productionEnabled,
    false,
  );
  const descriptorJson = JSON.stringify(runtime.descriptor);
  assert.equal(descriptorJson.includes(handoffAuthorization), false);
  assert.equal(descriptorJson.includes(accessContextAuthorization), false);
});

test("operational runtime fails closed when configured access-context cannot mount", () => {
  assert.throws(
    () =>
      createOperationalRuntime({
        cwd: "/tmp/uni-operational",
        env: {
          API_GATEWAY_STATE_FILE: "state.json",
          UNI_CO_PREVIEW_IDENTITY_BACKEND_BASE_URL: "https://identity.example.test",
          UNI_CO_PREVIEW_ACCESS_CONTEXT_AUTHORIZATION: `Bearer ${"A".repeat(48)}`,
        },
        gatewayFactory() {
          return baseGateway(app("base"), Object.freeze({ marker: "store" }));
        },
        previewLoginCompositionFactory() {
          return loginComposition(app("login"));
        },
        previewAccountRuntimeCompositionFactory(input) {
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
        previewAccountAccessContextRuntimeCompositionFactory(input) {
          return Object.freeze({
            enabled: false,
            app: input.app,
            descriptor: Object.freeze({
              mode: "preview-only",
              productionEnabled: false,
              consumerConfigured: false,
              runtimeAutoWiring: false,
            }),
          });
        },
        githubRuntimeFactory: githubRuntimeDisabled,
      }),
    /configured uni\.co preview account access-context is unavailable/,
  );
});
