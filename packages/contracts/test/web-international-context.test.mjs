import assert from "node:assert/strict";
import test from "node:test";

import {
  assertWebInternationalContext,
  createWebInternationalContext,
  supportedWebLocales,
} from "../src/web-international-context.mjs";

test("publishes the canonical 11 web locales", () => {
  assert.deepEqual(supportedWebLocales, [
    "pt-BR", "en", "es", "fr", "de", "it", "nl", "ja", "ko", "zh-CN", "ar",
  ]);
});

test("creates LTR context with ISO currency and legal region", () => {
  const context = createWebInternationalContext({
    locale: "en",
    fallbackLocale: "pt-BR",
    timeZone: "America/New_York",
    currency: "usd",
    legalRegion: "us",
  });

  assert.equal(context.direction, "ltr");
  assert.equal(context.currency, "USD");
  assert.equal(context.legalRegion, "US");
  assertWebInternationalContext(context);
});

test("forces RTL for Arabic", () => {
  const context = createWebInternationalContext({
    locale: "ar",
    fallbackLocale: "en",
    timeZone: "Asia/Riyadh",
    currency: "SAR",
    legalRegion: "SA",
  });

  assert.equal(context.direction, "rtl");
  assertWebInternationalContext(context);
});

test("rejects locales outside the published SaaS surface", () => {
  assert.throws(
    () => createWebInternationalContext({
      locale: "ru",
      fallbackLocale: "en",
      timeZone: "Europe/Moscow",
      currency: "RUB",
      legalRegion: "RU",
    }),
    /unsupported web locale/,
  );
});

test("rejects malformed currency and time zone", () => {
  assert.throws(
    () => createWebInternationalContext({
      locale: "pt-BR",
      fallbackLocale: "en",
      timeZone: "Sao_Paulo",
      currency: "REAL",
      legalRegion: "BR",
    }),
    /currency must be an ISO 4217 style code/,
  );
});
