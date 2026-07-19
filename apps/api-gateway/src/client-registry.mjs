import { randomUUID } from "node:crypto";
import {
  createApiKeyRecord,
  generateApiKey,
  hashApiKey,
  isApiKeyRecordActive,
  revokeApiKeyRecord,
  toPublicApiKeyRecord,
  verifyApiKeyHash,
} from "@apidevelopers/apikey-core";
import {
  CLIENT_STORE_SCHEMA_VERSION,
  createMemoryClientRepository,
} from "./client-repository.mjs";

const clone = (value) => structuredClone(value);
export { hashApiKey };

function platformError(message, code, status) {
  return Object.assign(new Error(message), { code, status });
}

function required(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw platformError(`${name} is required`, "invalid_client", 400);
  }
  return value.trim();
}

function validStatus(value) {
  return ["active", "suspended", "revoked"].includes(value);
}

function publicClient(client) {
  return clone({
    ...client,
    keys: client.keys.map(toPublicApiKeyRecord),
  });
}

function normalizeKeyRecord(record, { keyId, clock }) {
  if (!record || typeof record !== "object") return null;
  const status = record.status === "active" ? "active" : "revoked";
  return {
    id: record.id ?? keyId(),
    prefix: record.prefix ?? "legacy",
    hash: record.hash,
    status,
    createdAt: record.createdAt ?? clock(),
    revokedAt: status === "revoked" ? record.revokedAt ?? clock() : null,
  };
}

function normalizeClient(input, { clock, clientId, keyId }) {
  const now = clock();
  const createdAt = input.createdAt ?? now;
  const legacyKeys = input.apiKeyHash
    ? [{
        id: input.keyId ?? keyId(),
        prefix: input.apiKeyPrefix ?? "legacy",
        hash: input.apiKeyHash,
        status: input.status === "active" ? "active" : "revoked",
        createdAt,
        revokedAt: input.status === "active" ? null : input.updatedAt ?? now,
      }]
    : [];

  const keys = (Array.isArray(input.keys) ? input.keys : legacyKeys)
    .map((record) => normalizeKeyRecord(record, { keyId, clock }))
    .filter(Boolean);

  return {
    id: input.id ?? clientId(),
    name: required(input.name, "name"),
    contactEmail: required(input.contactEmail, "contactEmail").toLowerCase(),
    status: validStatus(input.status ?? "active") ? input.status ?? "active" : "active",
    scopes:
      Array.isArray(input.scopes) && input.scopes.length
        ? [...new Set(input.scopes)]
        : ["api:read"],
    createdAt,
    updatedAt: input.updatedAt ?? now,
    keys,
  };
}

export function createClientRegistry({
  repository = createMemoryClientRepository(),
  clock = () => new Date().toISOString(),
  clientId = randomUUID,
  keyId = randomUUID,
  keyFactory = generateApiKey,
  maxActiveKeys = 5,
  initialClients = [],
} = {}) {
  const state = repository.load();
  const source = Array.isArray(state) ? state : state?.clients ?? [];
  const clients = new Map(
    [...source, ...initialClients].map((input) => {
      const client = normalizeClient(input, { clock, clientId, keyId });
      return [client.id, client];
    }),
  );

  const save = () =>
    repository.save({
      schemaVersion: CLIENT_STORE_SCHEMA_VERSION,
      clients: [...clients.values()].map(clone),
    });

  const requireClient = (id) => {
    const client = clients.get(id);
    if (!client) {
      throw platformError(`client ${id} was not found`, "client_not_found", 404);
    }
    return client;
  };

  const issue = (client) => {
    const apiKey = keyFactory();
    const record = createApiKeyRecord({
      apiKey,
      id: keyId(),
      clock,
      prefixLength: 12,
    });
    client.keys.push({ ...record });
    client.updatedAt = record.createdAt;
    return { apiKey, key: record };
  };

  save();

  return Object.freeze({
    repositoryKind: repository.kind ?? "custom",

    createClient(input = {}) {
      const now = clock();
      const client = {
        id: input.id ?? clientId(),
        name: required(input.name, "name"),
        contactEmail: required(input.contactEmail, "contactEmail").toLowerCase(),
        status: validStatus(input.status ?? "active") ? input.status ?? "active" : "active",
        scopes:
          Array.isArray(input.scopes) && input.scopes.length
            ? [...new Set(input.scopes)]
            : ["api:read"],
        createdAt: now,
        updatedAt: now,
        keys: [],
      };

      if (clients.has(client.id)) {
        throw platformError("client already exists", "client_exists", 409);
      }

      const issued = issue(client);
      clients.set(client.id, client);
      save();

      return {
        client: publicClient(client),
        apiKey: issued.apiKey,
        key: toPublicApiKeyRecord(issued.key),
      };
    },

    listClients() {
      return [...clients.values()]
        .map(publicClient)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    },

    getClient(id) {
      return clients.has(id) ? publicClient(clients.get(id)) : null;
    },

    authenticate(apiKey) {
      if (typeof apiKey !== "string" || apiKey.length < 8) return null;

      for (const client of clients.values()) {
        if (client.status !== "active") continue;
        const key = client.keys.find(
          (record) =>
            isApiKeyRecordActive(record) &&
            verifyApiKeyHash(apiKey, record.hash),
        );
        if (key) {
          return {
            ...publicClient(client),
            authenticatedKeyId: key.id,
          };
        }
      }

      return null;
    },

    rotateApiKey(id, { revokeExisting = false } = {}) {
      const client = requireClient(id);
      const active = client.keys.filter(isApiKeyRecordActive);

      if (!revokeExisting && active.length >= maxActiveKeys) {
        throw platformError(
          "active key limit reached",
          "active_key_limit_reached",
          409,
        );
      }

      if (revokeExisting) {
        client.keys = client.keys.map((record) =>
          isApiKeyRecordActive(record)
            ? { ...revokeApiKeyRecord(record, { clock }) }
            : record,
        );
      }

      const issued = issue(client);
      save();

      return {
        client: publicClient(client),
        apiKey: issued.apiKey,
        key: toPublicApiKeyRecord(issued.key),
      };
    },

    revokeApiKey(id, idToRevoke) {
      const client = requireClient(id);
      const index = client.keys.findIndex((record) => record.id === idToRevoke);
      if (index < 0) {
        throw platformError("API key was not found", "api_key_not_found", 404);
      }

      const changed = isApiKeyRecordActive(client.keys[index]);
      if (changed) {
        client.keys[index] = {
          ...revokeApiKeyRecord(client.keys[index], { clock }),
        };
        client.updatedAt = client.keys[index].revokedAt;
        save();
      }

      return {
        client: publicClient(client),
        key: toPublicApiKeyRecord(client.keys[index]),
        changed,
      };
    },

    updateClientStatus(id, status) {
      if (!validStatus(status)) {
        throw platformError(
          "invalid client status",
          "invalid_client_status",
          400,
        );
      }

      const client = requireClient(id);
      client.status = status;
      client.updatedAt = clock();

      if (status === "revoked") {
        client.keys = client.keys.map((record) =>
          isApiKeyRecordActive(record)
            ? { ...revokeApiKeyRecord(record, { clock: () => client.updatedAt }) }
            : record,
        );
      }

      save();
      return publicClient(client);
    },
  });
}
