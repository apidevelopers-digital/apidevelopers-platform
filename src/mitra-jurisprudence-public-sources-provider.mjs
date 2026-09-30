import { normalizeJurisprudenceProviderOutput } from "./mitra-jurisprudence-provider-readonly.mjs";

function providerList(providers) {
  return Array.isArray(providers) ? providers.filter((provider) => provider?.enabled && typeof provider.search === "function") : [];
}

export function createPublicSourcesJurisprudenceProvider({ providers = [] } = {}) {
  const enabledProviders = providerList(providers);

  if (enabledProviders.length === 0) {
    return Object.freeze({
      id: "public-sources",
      enabled: false,
      async search() {
        throw new Error("public_sources_provider_disabled");
      },
    });
  }

  return Object.freeze({
    id: "public-sources",
    enabled: true,
    providerIds: Object.freeze(enabledProviders.map((provider) => provider.id).filter(Boolean)),

    async search(query, context) {
      const collected = [];

      for (const provider of enabledProviders) {
        try {
          const output = await provider.search(query, context);
          const results = normalizeJurisprudenceProviderOutput(output, query.limit ?? 5);
          collected.push(...results);
        } catch {
          // Public source failures are intentionally isolated so one provider
          // cannot break the read-only jurisprudence route.
        }
      }

      return Object.freeze({
        results: Object.freeze(normalizeJurisprudenceProviderOutput({ results: collected }, query.limit ?? 5)),
      });
    },
  });
}
