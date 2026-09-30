import { createAdaMitraBridgeReadOnly } from "./ada-mitra-bridge-readonly.mjs";
import { createPublicJurisprudenceProviderFromEnv } from "./mitra-jurisprudence-public-sources-provider-config.mjs";

export function createAdaMitraBridgeReadOnlyFromRuntimeEnv({
  authenticator,
  env = process.env,
  fetchFn = globalThis.fetch,
  jurisprudenceProvider,
} = {}) {
  const configuredProvider = jurisprudenceProvider ?? createPublicJurisprudenceProviderFromEnv({
    env,
    fetchFn,
  });

  return createAdaMitraBridgeReadOnly({
    authenticator,
    jurisprudenceProvider: configuredProvider?.enabled ? configuredProvider : undefined,
  });
}
