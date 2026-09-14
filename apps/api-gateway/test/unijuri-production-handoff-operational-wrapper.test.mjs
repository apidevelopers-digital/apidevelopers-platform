import assert from "node:assert/strict";
import test from "node:test";

import {
  attachUniJuriProductionHandoffToGateway,
  resolveUniJuriProductionHandoffEnabled,
} from "../src/unijuri-production-handoff-operational-wrapper.mjs";

test("UniJuri production handoff is fail-closed by default", () => {
  assert.equal(resolveUniJuriProductionHandoffEnabled({}), false);
  assert.equal(
    resolveUniJuriProductionHandoffEnabled({
      UNIJURI_PRODUCTION_HANDOFF_ENABLED: "false",
    }),
    false,
  );
});

test("UniJuri production handoff rejects invalid boolean configuration", () => {
  assert.throws(
    () =>
      resolveUniJuriProductionHandoffEnabled({
        UNIJURI_PRODUCTION_HANDOFF_ENABLED: "yes",
      }),
    /must be true or false/,
  );
});

test("UniJuri production handoff wiring uses gateway store and authenticator", () => {
  const app = { async handleRequest() {} };
  const store = { async transaction() {} };
  const authenticator = { async authenticate() {} };
  const gateway = { app, store, authenticator, readiness: {} };
  let received;

  const wrapped = attachUniJuriProductionHandoffToGateway({
    gateway,
    env: { UNIJURI_PRODUCTION_HANDOFF_ENABLED: "true" },
    compositionFactory(options) {
      received = options;
      return {
        enabled: true,
        app: { async handleRequest() {} },
        descriptor: {
          mode: "production-restricted",
          targetOrigin: "https://unijuri.sitedauni.com",
          productionEnabled: true,
        },
      };
    },
  });

  assert.equal(received.app, app);
  assert.equal(received.persistenceStore, store);
  assert.equal(received.sourceAuthenticator, authenticator);
  assert.equal(received.redeemerAuthenticator, authenticator);
  assert.equal(received.enabled, true);
  assert.equal(typeof wrapped.app.handleRequest, "function");
  assert.deepEqual(wrapped.uniJuriProductionHandoff, {
    mode: "production-restricted",
    targetOrigin: "https://unijuri.sitedauni.com",
    productionEnabled: true,
  });
});
