import {
  createAuthenticator as createCoreAuthenticator,
  extractApiKey,
} from "@apidevelopers/auth-core";

export { extractApiKey };

export function createAuthenticator({ clientStore, adminKey } = {}) {
  if (!clientStore || typeof clientStore.authenticate !== "function") {
    throw new TypeError("clientStore with authenticate() is required");
  }

  return createCoreAuthenticator({
    adminKey,
    resolveClient: (apiKey) => clientStore.authenticate(apiKey),
  });
}
