import {
  createApiKeyRecord,
  generateApiKey,
  hashApiKey,
  revokeApiKeyRecord,
} from "./index.mjs";

function requireFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
  return value;
}

function requireRepository(repository) {
  for (const method of ["create", "replace", "getById", "listByTenant", "getActiveByPrefix", "rotate"]) {
    if (typeof repository?.[method] !== "function") {
      throw new TypeError(`repository.${method} must be a function`);
    }
  }
  return repository;
}

function requireText(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

function normalizeGeneratedKey(value) {
  if (typeof value === "string") {
    return {
      secret: value,
      prefix: value.slice(0, 12),
      keyHash: hashApiKey(value),
    };
  }

  const secret = requireText(value?.secret, "generated secret");
  return {
    secret,
    prefix: requireText(value?.prefix ?? secret.slice(0, 12), "generated prefix"),
    keyHash: requireText(value?.keyHash ?? value?.hash ?? hashApiKey(secret), "generated keyHash"),
  };
}

export function createApiKeyLifecycleService({
  repository,
  idFactory = () => crypto.randomUURI(),
  clock = () => new Date().toISOString(),
  generateKey = generateApiKey,
  assertTenantOperational = async () => true,
} = {}) {
  const repo = requireRepository(repository);
  const nextId = requireFunction(idFactory, "idFactory");
  const now = requireFunction(clock, "clock");
  const issueKey = requireFunction(generateKey, "generateKey");
  const assertTenant = requireFunction(assertTenantOperational, "assertTenantOperational");

  return Object.freeze({
    repositoryKind: repo.kind ?? "custom",

    async issueApiKey({ tenantId, name, scopes = [] }) {
      const normalizedTenantId = requireText(tenantId, "tenantId");
      await assertTenant(normalizedTenantId);

      const generated = normalizeGeneratedKey(issueKey());
      const record = createApiKeyRecord({
        id: nextId(),
        tenantId: normalizedTenantId,
        name,
        prefix: generated.prefix,
        keyHash: generated.keyHash,
        scopes,
        createdAt: now(),
      });

      return {
        apiKey: await repo.create(record),
        secret: generated.secret,
        events: [{
          type: "apikey.issued",
          tenantId: normalizedTenantId,
          apiKeyId: record.id,
          occurredAt: record.createdAt,
        }],
      };
    },

    async revokeApiKey({ tenantId, apiKeyId, reason = "revoked" }) {
      const normalizedTenantId = requireText(tenantId, "tenantId");
      const id = requireText(apiKeyId, "apiKeyId");
      await assertTenant(normalizedTenantId);

      const current = await repo.getById(id);
      if (!current || current.tenantId !== normalizedTenantId) {
        throw new Error("API key was not found for tenant");
      }

      const revokedAt = now();
      const revoked = revokeApiKeyRecord(current, { revokedAt, reason });
      return {
        apiKey: await repo.replace(revoked),
        events: [{
          type: "apikey.revoked",
          tenantId: normalizedTenantId,
          apiKeyId: id,
          occurredAt: revokedAt,
        }],
      };
    },

    async rotateApiKey({ tenantId, apiKeyId, name, scopes }) {
      const normalizedTenantId = requireText(tenantId, "tenantId");
      const id = requireText(apiKeyId, "apiKeyId");
      await assertTenant(normalizedTenantId);

      const current = await repo.getById(id);
      if (!current || current.tenantId !== normalizedTenantId) {
        throw new Error("API key was not found for tenant");
      }
      if (current.status !== "active") {
        throw new Error("only active API keys can be rotated");
      }

      const rotatedAt = now();
      const generated = normalizeGeneratedKey(issueKey());
      const previous = revokeApiKeyRecord(current, {
        revokedAt: rotatedAt,
        reason: "rotated",
      });
      const next = createApiKeyRecord({
        id: nextId(),
        tenantId: normalizedTenantId,
        name: name ?? current.name,
        prefix: generated.prefix,
        keyHash: generated.keyHash,
        scopes: scopes ?? current.scopes,
        createdAt: rotatedAt,
      });

      const committed = await repo.rotate({ previous, current: next });
      return {
        previous: committed.previous,
        apiKey: committed.current,
        secret: generated.secret,
        events: [{
          type: "apikey.rotated",
          tenantId: normalizedTenantId,
          previousApiKeyId: previous.id,
          apiKeyId: next.id,
          occurredAt: rotatedAt,
        }],
      };
    },

    async listApiKeys(tenantId, options = {}) {
      const normalizedTenantId = requireText(tenantId, "tenantId");
      await assertTenant(normalizedTenantId);
      return repo.listByTenant(normalizedTenantId, options);
    },

    async findActiveByPrefix(tenantId, prefix) {
      const normalizedTenantId = requireText(tenantId, "tenantId");
      await assertTenant(normalizedTenantId);
      return repo.getActiveByPrefix(normalizedTenantId, requireText(prefix, "prefix"));
    },
  });
}
