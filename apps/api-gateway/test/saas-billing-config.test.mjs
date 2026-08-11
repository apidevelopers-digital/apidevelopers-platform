import assert from "node:assert/strict";
import test from "node:test";

import { readSaasBillingConfig } from "../src/saas-billing-config.mjs";

test("billing is disabled by default and requires no secrets", () => {
  const config = readSaasBillingConfig({});
  assert.equal(config.enabled, false);
  assert.equal(config.provider, null);
  assert.equal(config.mode, null);
});

test("enabled test mode requires provider catalog and secret variables", () => {
  assert.throws(
    () => readSaasBillingConfig({ APD_BILLING_ENABLED: "true" }),
    /APD_BILLING_PROVIDER/,
  );

  const config = readSaasBillingConfig({
    APD_BILLING_ENABLED: "true",
    APD_BILLING_PROVIDER: "stripe",
    APD_BILLING_MODE: "test",
    APD_BILLING_CATALOG_PATH: "/run/config/billing-catalog.json",
    STRIPE_SECRET_KEY: "fixture-secret",
    STRIPE_WEBHOOK_SECRET: "fixture-webhook",
  });
  assert.equal(config.enabled, true);
  assert.equal(config.provider, "stripe");
  assert.equal(config.mode, "test");
  assert.equal(config.catalogPath, "/run/config/billing-catalog.json");
});

test("live mode fails closed unless explicitly enabled", () => {
  const env = {
    APD_BILLING_ENABLED: "true",
    APD_BILLING_PROVIDER: "stripe",
    APD_BILLING_MODE: "live",
    APD_BILLING_CATALOG_PATH: "/run/config/billing-catalog.json",
    STRIPE_SECRET_KEY: "fixture-secret",
    STRIPE_WEBHOOK_SECRET: "fixture-webhook",
  };

  assert.throws(
    () => readSaasBillingConfig(env),
    /APD_BILLING_LIVE_ENABLED=true/,
  );

  const config = readSaasBillingConfig({
    ...env,
    APD_BILLING_LIVE_ENABLED: "true",
  });
  assert.equal(config.mode, "live");
});
