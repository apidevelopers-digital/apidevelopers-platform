import { extractApiKey, secureCompareSecrets } from "./index.mjs";

function freezeIdentity(role, principal) {
  return Object.freeze({
    role,
    principal: Object.freeze(structuredClone(principal)),
  });
}

export function createAsyncAuthenticator({
  adminKey,
  resolveClient,
  adminPrincipal = {
    id: "platform-admin",
    name: "Platform Administrator",
    status: "active",
    scopes: ["admin:*"],
  },
  compareSecrets = secureCompareSecrets,
} = {}) {
  if (typeof resolveClient !== "function") {
    throw new TypeError("resolveClient must be a function");
  }

  return Object.freeze({
    async authenticate(headers = {}) {
      const apiKey = extractApiKey(headers);
      if (!apiKey) return null;

      if (adminKey && compareSecrets(apiKey, adminKey)) {
        return freezeIdentity("admin", adminPrincipal);
      }

      const client = await resolveClient(apiKey);
      if (!client) return null;

      return freezeIdentity("client", client);
    },
  });
}
