import assert from "node:assert/strict";
import test from "node:test";

import { createOperationalRuntime } from "../src/operational-runtime.mjs";

const previewDescriptor = Object.freeze({
  enabled: true,
  mode: "preview-assisted",
  productId: "product:uni-co",
  host: "unico-preview.apidevelopers.digital",
  identityBackendConfigured: true,
  automaticProvisioning: false,
  rawSessionSecretPersisted: false,
  transientOperatorSessionReturnedToBrowser: false,
});

test("operational runtime wires governed uni.co preview login before gateway transforms", () => {
  const baseApp = { async handleRequest() {} };
  const wrappedApp = { async handleRequest() {} };
  const store = {};
  let compositionInput;
  let transformInput;

  const runtime = createOperationalRuntime({
    cwd: "/tmp/runtime",
    env: {
      API_GATEWAY_STATE_FILE: "state.json",
      UNI_CO_PREVIEW_IDENTITY_BACKEND_BASE_URL: "https://unico.sitedauni.com",
    },
    gatewayFactory() {
      return {
        app: baseApp,
        readiness: {},
        store,
      };
    },
    previewLoginCompositionFactory(input) {
      compositionInput = input;
      return Object.freeze({
        enabled: true,
        app: wrappedApp,
        descriptor: previewDescriptor,
      });
    },
    gatewayTransform(input) {
      transformInput = input;
      return input.gateway;
    },
  });

  assert.equal(compositionInput.app, baseApp);
  assert.equal(compositionInput.store, store);
  assert.equal(
    compositionInput.identityBackendBaseUrl,
    "https://unico.sitedauni.com",
  );
  assert.equal(transformInput.gateway.app, wrappedApp);
  assert.equal(transformInput.gateway.store, store);
  assert.equal(runtime.app, wrappedApp);
  assert.deepEqual(runtime.descriptor.uniCoPreviewLogin, previewDescriptor);
  assert.equal(
    JSON.stringify(runtime.descriptor).includes("https://unico.sitedauni.com"),
    false,
  );
});

test("operational runtime does not attach preview login without explicit identity backend configuration", () => {
  let compositionCalled = false;
  const baseApp = { async handleRequest() {} };

  const runtime = createOperationalRuntime({
    cwd: "/tmp/runtime",
    env: {
      API_GATEWAY_STATE_FILE: "state.json",
    },
    gatewayFactory() {
      return {
        app: baseApp,
        readiness: {},
        store: {},
      };
    },
    previewLoginCompositionFactory() {
      compositionCalled = true;
      throw new Error("must_not_run");
    },
  });

  assert.equal(compositionCalled, false);
  assert.equal(runtime.app, baseApp);
  assert.equal("uniCoPreviewLogin" in runtime.descriptor, false);
});
