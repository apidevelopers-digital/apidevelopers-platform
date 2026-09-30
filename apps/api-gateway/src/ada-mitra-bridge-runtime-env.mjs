import { createAdaMitraBridgeReadOnly } from "./ada-mitra-bridge-readonly.mjs";
import { createJuridimetriaJurisprudenceProviderFromEnv } from "./mitra-jurisprudence-juridimetria-provider-config.mjs";

export function createAdaMitraBridgeReadOnlyFromRuntimeEnv({
  authenticator,
  env = process.env,
  fetchFn = globalThis.fetch,
  jurisprudenceProvider,
} = {}) {
  const configuredProvider = jurisprudenceProvider ?? createJuridimetriaJurisprudenceProviderFromEnv({
    env,
    fetchFn,
  });

  return createAdaMitraBridgeReadOnly({
    authenticator,
    jurisprudenceProvider: configuredProvider?.enabled ? configuredProvider : undefined,
  });
}
