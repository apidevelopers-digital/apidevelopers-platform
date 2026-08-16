const VERSION = 1;

export const supportedWebLocales = Object.freeze([
  "pt-BR",
  "en",
  "es",
  "fr",
  "de",
  "it",
  "nl",
  "ja",
  "ko",
  "zh-CN",
  "ar",
]);

const LOCALE_SET = new Set(supportedWebLocales);
const ISO_CURRENCY = /^[A-Z]{3}$/;
const TIME_ZONE = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)+$/;

function nonEmpty(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function directionFor(locale) {
  return locale.toLowerCase().startsWith("ar") ? "rtl" : "ltr";
}

export const webInternationalContextContractVersion = VERSION;

export function createWebInternationalContext({
  locale = "pt-BR",
  fallbackLocale = "en",
  timeZone,
  currency = "BRL",
  legalRegion,
} = {}) {
  locale = nonEmpty(locale, "locale");
  fallbackLocale = nonEmpty(fallbackLocale, "fallbackLocale");
  timeZone = nonEmpty(timeZone, "timeZone");
  currency = nonEmpty(currency, "currency").toUpperCase();
  legalRegion = nonEmpty(legalRegion, "legalRegion").toUpperCase();

  if (!LOCALE_SET.has(locale)) {
    throw new RangeError(`unsupported web locale: ${locale}`);
  }
  if (!LOCALE_SET.has(fallbackLocale)) {
    throw new RangeError(`unsupported fallback web locale: ${fallbackLocale}`);
  }
  if (!ISO_CURRENCY.test(currency)) {
    throw new TypeError("currency must be an ISO 4217 style code");
  }
  if (!TIME_ZONE.test(timeZone) && timeZone !== "UTC") {
    throw new TypeError("timeZone must be an IANA time zone or UTC");
  }

  return Object.freeze({
    schemaVersion: VERSION,
    locale,
    fallbackLocale,
    direction: directionFor(locale),
    timeZone,
    currency,
    legalRegion,
  });
}

export function assertWebInternationalContext(value, name = "webInternationalContext") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  if (value.schemaVersion !== VERSION) {
    throw new TypeError(`${name}.schemaVersion must be ${VERSION}`);
  }

  const normalized = createWebInternationalContext(value);
  for (const field of ["locale", "fallbackLocale", "direction", "timeZone", "currency", "legalRegion"]) {
    if (value[field] !== normalized[field]) {
      throw new Error(`${name}.${field} is invalid`);
    }
  }
  return value;
}
