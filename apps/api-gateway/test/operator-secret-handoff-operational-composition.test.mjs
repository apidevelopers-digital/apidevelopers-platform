import assert from "node:assert/strict";
import test from "node:test";
import { createOperatorSecretHandoffOperationalComposition } from "../src/operator-secret-handoff-operational-composition.mjs";

const app = { async handleRequest() { return { status: 404, headers: {}, body: "{}" }; } };
const authenticator = { async authenticate() { return { principal: { scopes: ["admin:*"] } }; } };
const authorization = { decide() { return { effect: "allow" }; } };

test("handoff composition is disabled by default without constructing secret state", () => {
  let calls = 0;
  const result = createOperatorSecretHandoffOperationalComposition({
    env: {},
    handoffServiceFactory() { calls += 1; throw new Error("must not construct"); },
  });
  assert.equal(result.enabled, false);
  assert.equal(result.descriptor.productionChanged, false);
  assert.equal(calls, 0);
});

test("handoff composition rejects ambiguous enable flags", () => {
  assert.throws(
    () => createOperatorSecretHandoffOperationalComposition({ env: { OPERATOR_SECRET_HANDOFF_ENABLED: "yes" } }),
    /must be true or false/,
  );
});

test("enabled handoff requires canonical admin-key configuration", () => {
  assert.throws(
    () => createOperatorSecretHandoffOperationalComposition({
      app, authenticator, authorization,
      runtimeDescriptor: { adminKeyConfigured: false },
      env: { OPERATOR_SECRET_HANDOFF_ENABLED: "true" },
    }),
    /requires API_GATEWAY_ADMIN_KEY/,
  );
});

test("enabled handoff shares one service across HTTP and provider boundaries", () => {
  const service = { submit() {}, status() {}, async consume() {} };
  let httpService;
  let providerService;
  const result = createOperatorSecretHandoffOperationalComposition({
    app, authenticator, authorization,
    runtimeDescriptor: { adminKeyConfigured: true },
    env: { OPERATOR_SECRET_HANDOFF_ENABLED: "true" },
    handoffServiceFactory() { return service; },
    handoffHttpAppFactory(options) {
      httpService = options.handoffService;
      assert.equal(options.authenticator, authenticator);
      assert.equal(options.authorization, authorization);
      return { async handleRequest() {} };
    },
    handoffProviderFactory(options) {
      providerService = options.handoffService;
      return { async withSecret() {} };
    },
  });
  assert.equal(result.enabled, true);
  assert.equal(result.handoffService, service);
  assert.equal(httpService, service);
  assert.equal(providerService, service);
  assert.equal(result.descriptor.authentication, "gateway-canonical");
  assert.equal(result.descriptor.requiredScope, "admin:*");
  assert.equal(result.descriptor.productionChanged, false);
});
