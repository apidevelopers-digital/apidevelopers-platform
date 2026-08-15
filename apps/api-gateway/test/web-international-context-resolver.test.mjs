import assert from "node:assert/strict";
import test from "node:test";

import {
  createWebInternationalContextResolver,
  normalizeSupportedWebLocale,
} from "../src/web-international-context-resolver.mjs";

function fixture({
  profile = {
    defaultLocale: "pt-BR",
    fallbackLocale: "en",
    timeZone: "America/Sao_Paulo",
    legalRegion: "BR",
  },
  commercial = { currency: "BRL" },
} = {}) {
  const calls = [];
  const resolver = createWebInternationalContextResolver({
    tenantInternationalProfile: {
      async resolve(input) {
        calls.push({ type: "profile", input });
        return profile;
      },
    },
    commercialContext: {
      async resolve(input) {
        calls.push({ type: "commercial", input });
        return commercial;
      },
    },
  });

  return { resolver, calls };
}

const base = {
  identity: {
    principal: {
      id: "user:001",
      tenantId: "tenant:001",
    },
  },
  accessGrantId: "grant:001",
  workspaceId: "workspace:001",
  productId: "product:uni-co",
};

test("normalizes regional browser locales to one of the 11 canonical web locales", () => {
  assert.equal(normalizeSupportedWebLocale("es-MX"), "es");
  assert.equal(normalizeSupportedWebLocale("pt_PT"), "pt-BR");
  assert.equal(normalizeSupportedWebLocale("zh-Hans-CN"), "zh-CN");
  assert.equal(normalizeSupportedWebLocale("ar-SA"), "ar");
  assert.equal(normalizeSupportedWebLocale("ru-RU"), null);
});

test("uses browser locale only as preference while currency and jurisdiction stay server-side", async () => {
  const { resolver, calls } = fixture({
    profile: {
      defaultLocale: "en",
      fallbackLocale: "pt-BR",
      timeZone: "America/New_York",
      legalRegion: "US",
    },
    commercial: { currency: "USD" },
  });

  const result = await resolver.resolve({
    ...base,
    requestedLocale: "es-MX",
    currency: "JPY",
    legalRegion: "JP",
  });

  assert.equal(result.context.locale, "es");
  assert.equal(result.context.currency, "USD");
  assert.equal(result.context.legalRegion, "US");
  assert.equal(result.context.timeZone, "America/New_York");
  assert.equal(result.resolution.localeSource, "user_preference");

  const commercialCall = calls.find((call) => call.type === "commercial");
  assert.equal(commercialCall.input.tenantId, "tenant:001");
  assert.equal(commercialCall.input.accessGrantId, "grant:001");
});

test("falls back to tenant locale when browser requests an unsupported language", async () => {
  const { resolver } = fixture();
  const result = await resolver.resolve({
    ...base,
    requestedLocale: "ru-RU",
  });

  assert.equal(result.context.locale, "pt-BR");
  assert.equal(result.resolution.requestedLocaleSupported, false);
  assert.equal(result.resolution.localeSource, "tenant_default");
});

test("preserves RTL and commercial currency for Arabic tenants", async () => {
  const { resolver } = fixture({
    profile: {
      defaultLocale: "ar",
      fallbackLocale: "en",
      timeZone: "Asia/Riyadh",
      legalRegion: "SA",
    },
    commercial: { currency: "SAR" },
  });

  const result = await resolver.resolve({
    ...base,
    productId: "product:nexus",
    requestedLocale: "ar-SA",
  });

  assert.equal(result.context.locale, "ar");
  assert.equal(result.context.direction, "rtl");
  assert.equal(result.context.currency, "SAR");
  assert.equal(result.context.legalRegion, "SA");
});

test("fails closed on unsupported authoritative tenant locale", async () => {
  const { resolver } = fixture({
    profile: {
      defaultLocale: "ru-RU",
      fallbackLocale: "en",
      timeZone: "Europe/Moscow",
      legalRegion: "RU",
    },
  });

  await assert.rejects(
    () => resolver.resolve(base),
    /defaultLocale is not supported/,
  );
});

test("fails closed when commercial currency is unavailable", async () => {
  const { resolver } = fixture({ commercial: {} });

  await assert.rejects(
    () => resolver.resolve(base),
    /commercial currency must be a non-empty string/,
  );
});
