import assert from "node:assert/strict";
import test from "node:test";

import { readSaasBillingConfig } from "../src/saas-billing-config.mjs";

test("billing is disabled by default", () => {
  const config = readSaasBillingConfig({});
  assert.equal(config.enabled, false);
});

test("Mercado Pago is the only official configured provider", () => {
  const config = readSaasBillingConfig({
    APD_BILLING_ENABLED: "true",
    APD_BILLING_PROVIDER: "mercadopago",
    APD_BILLING_MODE: "test",
    APD_BILLING_CATALOG_PATH: "/run/config/billing-catalog.json",
    MP_ACCESS_TOKEN: "fixture-token",
    MP_WEBHOOK_SECRET: "fixture-webhook",
  });
  assert.equal(config.provider, "mercadopago");
  assert.deepEqual(config.secretEnvNames, ["MP_ACCESS_TOKEN", "MP_WEBHOOK_SECRET"]);

  assert.throws(() => readSaasBillingConfig({
    APD_BILLING_ENABLED: "true",
    APD_BILLING_PROVIDER: "stripe",
    APD_BILLING_MODE: "test",
    APD_BILLING_CATALOG_PATH: "/run/config/billing-catalog.json",
    STRIPE_SECRET_KEY: "fixture",
    STRIPE_WEBHOOK_SECRET: "fixture",
  }), /unsupported billing provider: stripe/);
});

test("live Mercado Pago billing fails closed without explicit live switch", () => {
  const base = {
    APD_BILLING_ENABLED: "true",
    APD_BILLING_PROVIDER: "mercadopago",
    APD_BILLING_MODE: "live",
    APD_BILLING_CATALOG_PATH: "/run/config/billing-catalog.json",
    MP_ACCESS_TOKEN: "fixture-token",
    MP_WEBHOOK_SECRET: "fixture-webhook",
  };
  assert.throws(() => readSaasBillingConfig(base), /APD_BILLING_LIVE_ENABLED=true/);
  assert.equal(readSaasBillingConfig({ ...base, APD_BILLING_LIVE_ENABLED: "true" }).mode, "live");
});
