import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

function clone(value) {
  return structuredClone(value);
}

function requiredString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function normalizeScopes(scopes) {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    return ["api:read"];
  }

  return [...new Set(scopes.map((scope) => requiredString(scope, "scope")))].sort();
}

export function hashApiKey(apiKey) {
  return createHash("sha256").update(requiredString(apiKey, "apiKey")).digest("hex");
}

export function generateApiKey() {
  return `apid_${randomBytes(24).toString("base64url")}`;
}

function safeHashEquals(left, right) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function publicClient(client) {
  const { apiKeyHash: _apiKeyHash, ...safe } = client;
  return clone(safe);
}

export function createClientStore({
  clock = () => new Date().toISOString(),
  idFactory = () => randomUUID(),
  initialClients = [],
} = {}) {
  const clients = new Map();

  function persistClient(input, { apiKey, apiKeyHash } = {}) {
    const now = clock();
    const client = {
      id: input.id ?? idFactory(),
      name: requiredString(input.name, "name"),
      contactEmail: requiredString(input.contactEmail, "contactEmail"),
      status: input.status ?? "active",
      scopes: normalizeScopes(input.scopes),
      createdAt: input.createdAt ?? now,
      updatedAt: now,
      apiKeyHash: apiKeyHash ?? hashApiKey(apiKey),
    };

    if (!["active", "suspended", "revoked"].includes(client.status)) {
      throw new TypeError("status must be active, suspended or revoked");
    }

    if (clients.has(client.id)) {
      throw new Error(`client ${client.id} already exists`);
    }

    clients.set(client.id, client);
    return client;
  }

  for (const entry of initialClients) {
    persistClient(entry, {
      apiKey: entry.apiKey,
      apiKeyHash: entry.apiKeyHash,
    });
  }

  return Object.freeze({
    createClient(input = {}) {
      const apiKey = generateApiKey();
      const client = persistClient(input, { apiKey });
      return Object.freeze({
        client: publicClient(client),
        apiKey,
      });
    },

    listClients() {
      return [...clients.values()]
        .map(publicClient)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    },

    getClient(id) {
      const client = clients.get(id);
      return client ? publicClient(client) : null;
    },

    authenticate(apiKey) {
      if (typeof apiKey !== "string" || apiKey.trim() === "") return null;
      const candidateHash = hashApiKey(apiKey);

      for (const client of clients.values()) {
        if (client.status === "active" && safeHashEquals(client.apiKeyHash, candidateHash)) {
          return publicClient(client);
        }
      }

      return null;
    },
  });
}
