import { createHash, timingSafeEqual } from "node:crypto";

function normalizedHeaders(headers = {}) {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );
}

export function extractApiKey(headers = {}) {
  const normalized = normalizedHeaders(headers);
  const direct = normalized["x-api-key"];

  if (typeof direct === "string" && direct.trim() !== "") {
    return direct.trim();
  }

  const authorization = normalized.authorization;
  if (typeof authorization !== "string") return null;

  const match = authorization.match(/^(?:ApiKey|Bearer)\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function digest(value) {
  return createHash("sha256").update(value).digest();
}

function secureEquals(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftDigest = digest(left);
  const rightDigest = digest(right);
  return timingSafeEqual(leftDigest, rightDigest);
}

export function createAuthenticator({ clientStore, adminKey } = {}) {
  if (!clientStore || typeof clientStore.authenticate !== "function") {
    throw new TypeError("clientStore with authenticate() is required");
  }

  return Object.freeze({
    authenticate(headers = {}) {
      const apiKey = extractApiKey(headers);
      if (!apiKey) return null;

      if (adminKey && secureEquals(apiKey, adminKey)) {
        return Object.freeze({
          role: "admin",
          principal: Object.freeze({
            id: "platform-admin",
            name: "Platform Administrator",
            status: "active",
            scopes: ["admin:*"],
          }),
        });
      }

      const client = clientStore.authenticate(apiKey);
      if (!client) return null;

      return Object.freeze({
        role: "client",
        principal: client,
      });
    },
  });
}
