import assert from "node:assert/strict";
import test from "node:test";

import { BR_PUBLIC_SAAS_SURFACE_REGISTRY } from "../surfaces/br-public-saas.mjs";
import { createPublicCheckoutSurfaceBinding } from "../surfaces/public-checkout-binding.mjs";

test("canonical public SaaS surfaces remain checkout-disabled by default", () => {
  for (const surface of BR_PUBLIC_SAAS_SURFACE_REGISTRY.list()) {
    assert.equal(surface.checkoutEnabled, false);
    assert.throws(
      () =>
        createPublicCheckoutSurfaceBinding({
          surfaceId: surface.surfaceId,
          successUrl: `${surface.origin}/billing/success`,
          cancelUrl: `${surface.origin}/billing/cancel`,
        }),
      /billing_surface_checkout_disabled/,
    );
  }
});

test("enabled checkout binding derives product and origin authority from the registry", () => {
  const registry = {
    get(surfaceId) {
      assert.equal(surfaceId, "imuni-public");
      return Object.freeze({
        surfaceId: "imuni-public",
        productId: "imuni",
        origin: "https://imuni.sitedauni.com",
        status: "published",
        checkoutEnabled: true,
      });
    },
  };

  const binding = createPublicCheckoutSurfaceBinding({
    surfaceId: "imuni-public",
    successUrl: "https://imuni.sitedauni.com/billing/success",
    cancelUrl: "https://imuni.sitedauni.com/billing/cancel",
    registry,
  });

  assert.deepEqual(binding, {
    surfaceId: "imuni-public",
    productId: "imuni",
    allowedOrigins: ["https://imuni.sitedauni.com"],
    successUrl: "https://imuni.sitedauni.com/billing/success",
    cancelUrl: "https://imuni.sitedauni.com/billing/cancel",
  });
});

test("enabled checkout binding rejects return URLs outside the registry origin", () => {
  const registry = {
    get() {
      return Object.freeze({
        surfaceId: "imuni-public",
        productId: "imuni",
        origin: "https://imuni.sitedauni.com",
        status: "published",
        checkoutEnabled: true,
      });
    },
  };

  assert.throws(
    () =>
      createPublicCheckoutSurfaceBinding({
        surfaceId: "imuni-public",
        successUrl: "https://evil.example/billing/success",
        cancelUrl: "https://imuni.sitedauni.com/billing/cancel",
        registry,
      }),
    /billing_surface_return_origin_mismatch/,
  );
});
