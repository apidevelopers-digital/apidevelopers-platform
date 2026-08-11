import assert from "node:assert/strict";
import test from "node:test";

import {
  BR_PUBLIC_SAAS_SURFACE_REGISTRY,
  BR_PUBLIC_SAAS_SURFACES,
} from "../surfaces/br-public-saas.mjs";

test("BR public SaaS surface registry anchors the currently published catalog products", () => {
  const expectedPublished = new Map([
    ["imuni", "https://sitedauni.com/apps/imuni/"],
    ["uni.juri", "https://sitedauni.com/apps/juri/"],
    ["uni.verso", "https://sitedauni.com/apps/universo/"],
    ["uni.co", "https://sitedauni.com/apps/unico/"],
    ["zuni", "https://zuni.sitedauni.com/"],
  ]);

  const published = BR_PUBLIC_SAAS_SURFACE_REGISTRY.published();
  assert.equal(published.length, expectedPublished.size);

  for (const surface of published) {
    assert.equal(surface.status, "published");
    assert.equal(surface.checkoutEnabled, false);
    assert.equal(surface.publicUrl, expectedPublished.get(surface.productId));
    assert.equal(new URL(surface.publicUrl).origin, surface.origin);
  }
});

test("uni.social is anchored as planned and cannot be mistaken for a published checkout surface", () => {
  const surface = BR_PUBLIC_SAAS_SURFACE_REGISTRY.get("sitedauni-uni-social");

  assert.equal(surface.productId, "uni.social");
  assert.equal(surface.origin, "https://sitedauni.com");
  assert.equal(surface.publicUrl, "https://sitedauni.com/apps/uni-social/");
  assert.equal(surface.status, "planned");
  assert.equal(surface.checkoutEnabled, false);
  assert.equal(
    BR_PUBLIC_SAAS_SURFACE_REGISTRY.published().some((item) => item.productId === "uni.social"),
    false,
  );
});

test("all anchored billing products have exactly one surface record in the BR inventory", () => {
  const expectedProducts = ["imuni", "uni.co", "uni.juri", "uni.social", "uni.verso", "zuni"];
  assert.deepEqual(
    BR_PUBLIC_SAAS_SURFACES.map((surface) => surface.productId).sort(),
    expectedProducts.sort(),
  );
  assert.equal(new Set(BR_PUBLIC_SAAS_SURFACES.map((surface) => surface.surfaceId)).size, 6);
});
