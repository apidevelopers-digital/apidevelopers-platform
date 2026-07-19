import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { CLIENT_STORE_SCHEMA_VERSION, createMemoryClientRepository } from "./client-repository.mjs";

const clone = (v) => structuredClone(v);
export const hashApiKey = (v) => createHash("sha256").update(v)).digest("hex");
const hash = hashApiKey;
const makeKey = () => `apid_${randomBytes(24).toString("base64url")}`;
const validStatus = (v) => ["active", "suspended", "revoked"].includes(v);
const required = (v, name) => {
  if (typeof v !== "string" || !v.trim()) throw Object.assign(new Error(`${name} is required`), { code: "invalid_client", status: 400 });
  return v.trim();
};

function safeEqual(a, b) {
  if (!/^[a-f0-9]{64}$/i.test(a ?? "") || !/^[a-f0-9]{64}$/i.test(b ?? "")) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

function publicClient(client) {
  return clone({
    ...client,
    keys: client.keys.map(({ hash: _hash, ...key }) => key),
  });
}

function normalizeClient(input, clock, clientId, keyId) {
  const now = clock();
  const createdAt = input.createdAt ?? now;
  const keys = Array.isArray(input.keys) ? input.keys : input.apiKeyHash ? [{
    id: input.keyId ?? keyId(),
    prefix: input.apiKeyPrefix ?? "legacy",
    hash: input.apiKeyHash,
    status: input.status === "active" ? "active" : "revoked",
    createdAt,
    revokedAt: input.status === "active" ? null : input.updatedAt ?? now,
  }] : [];
  return {
    id: input.id ?? clientId(),
    name: required(input.name, "name"),
    contactEmail: required(input.contactEmail, "contactEmail").toLowerCase(),
    status: validStatus(input.status ?? "active") ? input.status ?? "active" : "active",
    scopes: Array.isArray(input.scopes) && input.scopes.length ? [...new Set(input.scopes)] : ["api:read"],
    createdAt,
    updatedAt: input.updatedAt ?? now,
    keys,
  };
}

export function createClientRegistry({
  repository = createMemoryClientRepository(),
  clock = () => new Date().toISOString(),
  clientId = () => randomUUID(),
  keyId = () => randomUUID(),
  keyFactory = makeKey,
  maxActiveKeys = 5,
  initialClients = [],
} = {}) {
  const raw = repository.load();
  const source = Array.isArray(raw) ? raw : raw?.clients ?? [];
  const clients = new Map([...source, ...initialClients].map((item) => {
    const client = normalizeClient(item, clock, clientId, keyId);
    return [client.id, client];
  }));

  const save = () => repository.save({
    schemaVersion: CLIENT_STORE_SCHEMA_VERSION,
    clients: [...clients.values()].map(clone),
  });
  const requireClient = (id) => {
    const client = clients.get(id);
    if (!client) throw Object.assign(new Error(`client ${id} was not found`), { code: "client_not_found", status: 404 });
    return client;
  };
  const issue = (client) => {
    const apiKey = keyFactory();
    const now = clock();
    const key = { id: keyId(), prefix: apiKey.slice(0, 12), hash: hash(apiKey), status: "active", createdAt: now, revokedAt: null };
    client.keys.push(key);
    client.updatedAt = now;
    return { apiKey, key };
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
        scopes: Array.isArray(input.scopes) && input.scopes.length ? [...new Set(input.scopes)] : ["api:read"],
        createdAt: now,
        updatedAt: now,
        keys: [],
      };
      if (clients.has(client.id)) throw Object.assign(new Error("client already exists"), { code: "client_exists", status: 409 });
      const issued = issue(client);
      clients.set(client.id, client);
      save();
      return { client: publicClient(client), apiKey: issued.apiKey, key: publicClient({ ...client, keys: [issued.key] }).keys[0] };
    },
    listClients: () => [...clients.values()].map(publicClient),
    getClient: (id) => clients.has(id) ? publicClient(clients.get(id)) : null,
    authenticate(apiKey) {
      if (typeof apiKey !== "string" || !apiKey) return null;
      const candidate = hash(apiKey);
      for (const client of clients.values()) {
        if (client.status !== "active") continue;
        const key = client.keys.find((item) => item.status === "active" && safeEqual(item.hash, candidate));
        if (key) return { ...publicClient(client), authenticatedKeyId: key.id };
      }
      return null;
    },
    rotateApiKey(id, { revokeExisting = false } = {}) {
      const client = requireClient(id);
      const active = client.keys.filter((key) => key.status === "active");
      if (!revokeExisting && active.length >= maxActiveKeys) {
        throw Object.assign(new Error("active key limit reached"), { code: "active_key_limit_reached", status: 409 });
      }
      if (revokeExisting) {
        const now = clock();
        for (const key of active) { key.status = "revoked"; key.revokedAt = now; }
      }
      const issued = issue(client);
      save();
      return { client: publicClient(client), apiKey: issued.apiKey, key: publicClient({ ...client, keys: [issued.key] }).keys[0] };
    },
    revokeApiKey(id, idToRevoke) {
      const client = requireClient(id);
      const key = client.keys.find((item) => item.id === idToRevoke);
      if (!key) throw Object.assign(new Error("API key was not found"), { code: "api_key_not_found", status: 404 });
      const changed = key.status !== "revoked";
      if (changed) { key.status = "revoked"; key.revokedAt = clock(); client.updatedAt = key.revokedAt; save(); }
      return { client: publicClient(client), key: publicClient({ ...client, keys: [key] }).keys[0], changed };
    },
    updateClientStatus(id, status) {
      if (!validStatus(status)) throw Object.assign(new Error("invalid client status"), { code: "invalid_client_status", status: 400 });
      const client = requireClient(id);
      client.status = status;
      client.updatedAt = clock();
      if (status === "revoked") {
        for (const key of client.keys) if (key.status === "active") { key.status = "revoked"; key.revokedAt = client.updatedAt; }
      }
      save();
      return publicClient(client);
    },
  });
}
