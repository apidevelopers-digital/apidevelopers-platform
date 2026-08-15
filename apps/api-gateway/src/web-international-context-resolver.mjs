import {
  createWebInternationalContext,
  supportedWebLocales,
} from "@apidevelopers/contracts";

const SUPPORTED = new Map(
  supportedWebLocales.map((locale) => [locale.toLowerCase(), locale]),
);

const LANGUAGE_DEFAULT = Object.freeze({
  pt: "pt-BR",
  en: "en",
  es: "es",
  fr: "fr",
  de: "de",
  it: "it",
  nl: "nl",
  ja: "ja",
  ko: "ko",
  zh: "zh-CN",
  ar: "ar",
});

function nonEmpty(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function object(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value;
}

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

export function normalizeSupportedWebLocale(value) {
  if (typeof value !== "string" || !value.trim()) return null;

  const raw = value.trim().replaceAll("_", "-");
  const exact = SUPPORTED.get(raw.toLowerCase());
  if (exact) return exact;

  let language;
  try {
    language = new Intl.Locale(raw).language.toLowerCase();
  } catch {
    language = raw.split("-")[0].toLowerCase();
  }
  return LANGUAGE_DEFAULT[language] ?? null;
}

export function createWebInternationalContextResolver({
  tenantInternationalProfile,
  commercialContext,
} = {}) {
  if (typeof tenantInternationalProfile?.resolve !== "function") {
    throw new TypeError("tenantInternationalProfile.resolve must be a function");
  }
  if (typeof commercialContext?.resolve !== "function") {
    throw new TypeError("commercialContext.resolve must be a function");
  }

  return Object.freeze({
    async resolve({
      identity,
      accessGrantId,
      workspaceId,
      productId,
      requestedLocale,
    } = {}) {
      const principalId = nonEmpty(identity?.principal?.id, "identity.principal.id");
      const tenantId = nonEmpty(identity?.principal?.tenantId, "identity.principal.tenantId");
      accessGrantId = nonEmpty(accessGrantId, "accessGrantId");
      workspaceId = nonEmpty(workspaceId, "workspaceId");
      productId = nonEmpty(productId, "productId");

      const profile = object(
        await tenantInternationalProfile.resolve({
          identity,
          principalId,
          tenantId,
          workspaceId,
          productId,
        }),
        "tenant international profile",
      );

      const defaultLocale = normalizeSupportedWebLocale(
        nonEmpty(profile.defaultLocale, "tenant profile defaultLocale"),
      );
      if (!defaultLocale) {
        throw new RangeError("tenant profile defaultLocale is not supported by the web surface");
      }

      const fallbackLocale = normalizeSupportedWebLocale(profile.fallbackLocale ?? "en");
      if (!fallbackLocale) {
        throw new RangeError(tenant profile fallbackLocale is not supported by the web surface");
      }

      const requested = normalizeSupportedWebLocale(requestedLocale);
      const locale = requested ?? defaultLocale;

      const commercial = object(
        await commercialContext.resolve({
          identity,
          principalId,
          tenantId,
          accessGrantId,
          workspaceId,
          productId,
        }),
        "commercial context",
      );

      const context = createWebInternationalContext({
        locale,
        fallbackLocale,
        timeZone: nonEmpty(profile.timeZone, "tenant profile timeZone"),
        currency: nonEmpty(commercial.currency, "commercial currency"),
        legalRegion: nonEmpty(profile.legalRegion, "tenant profile legalRegion"),
      });

      return freeze({
        context,
        resolution: {
          requestedLocale:
            typeof requestedLocale === "string" && requestedLocale.trim()
              ? requestedLocale.trim()
              : null,
          requestedLocaleSupported: Boolean(requested),
          localeSource: requested ? "user_preference" : "tenant_default",
          currencySource: "commercial_context",
          timeZoneSource: "tenant_profile",
          legalRegionSource: "tenant_profile",
        },
      });
    },
  });
}
