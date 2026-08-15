import assert from "node:assert/strict";
import test from "node:test";

import {
  createWebAgentShadowCommercialContextId,
  createWebAgentShadowPersistenceProviders,
  webAgentShadowPersistenceCollections,
} from "../src/web-agent-shadow-persistence-providers.mjs";

function createStore(initialCollections = {}) {
  const state = {
    collections: structuredClone(initialCollections),
  };

  return {
    kind: "test",
    async read() {
      return structuredClone(state);
    },
    async transaction(fn) {
      const tx = {
        get(collection, id) {
          return structuredClone(state.collections?.[collection]?.[id] ?? null);
        },
        put(collection, id, record) {
          state.collections[collection] ??= {};
          state.collections[collection][id] = structuredClone(record);
          return structuredClone(record);
        },
        delete(collection, id) {
          const existing = state.collections?.[collection]?.[id] ?? null;
          if (state.collections?.[collection]) delete state.collections[collection][id];
          return structuredClone(existing);
        },
      };
      return { result: await fn(tx), revision: 1 };
    },
  };
}

const sessionHash = "a".repeat(64);
const commercialContextId = createWebAgentShadowCommercialContextId({
  tenantId: "tenant:001",
  workspaceId: "workspace:001",
  productId: "product:uni-co",
});

function seededStore() {
  return createStore({
    [webAgentShadowPersistenceCollections.browserSessions]: {
      [sessionHash]: {
        sessionHash,
        status: "active",
        expiresAt: "2026-08-16T00:00:00.000Z",
        principal: {
          id: "user:001",
          tenantId: "tenant:001",
          status: "active",
          scopes: ["web:chat"],
        },
      },
    },
    [webAgentShadowPersistenceCollections.tenantInternationalProfiles]: {
      "tenant:001": {
        tenantId: "tenant:001",
        defaultLocale: "pt-BR",
        fallbackLocale: "en",
        timeZone: "America/Sao_Paulo",
        legalRegion: "BR",
        ignored: "not-forwarded",
      },
    },
    [webAgentShadowPersistenceCollections.commercialContexts]: {
      [commercialContextId]: {
        commercialContextId,
        tenantId: "tenant:001",
        workspaceId: "workspace:001",
        productId: "product:uni-co",
        currency: "brl",
        ignored: "not-forwarded",
      },
    },
  });
}

test("resolves a browser session only by canonical SHA-256 hash", async () => {
  const providers = createWebAgentShadowPersistenceProviders({
    store: seededStore(),
  });

  const session = await providers.resolveSessionByHash(sessionHash.toUpperCase());

  assert.equal(session.sessionHash, sessionHash);
  assert.equal(session.principal.tenantId, "tenant:001");
  assert.equal(Object.isFrozen(session), true);

  await assert.rejects(
    providers.resolveSessionByHash("not-a-hash"),
    /SHA-256 hex digest/,
  );
});

test("resolves tenant international profile with an explicit tenant key", async () => {
  const providers = createWebAgentShadowPersistenceProviders({
    store: seededStore(),
  });

  const profile = await providers.tenantInternationalProfile.resolve({
    tenantId: "tenant:001",
    workspaceId: "workspace:ignored",
    productId: "product:ignored",
  });

  assert.deepEqual(profile, {
    defaultLocale: "pt-BR",
    fallbackLocale: "en",
    timeZone: "America/Sao_Paulo",
    legalRegion: "BR",
  });
  assert.equal("ignored" in profile, false);
});

test("resolves commercial context by exact tenant workspace and product identity", async () => {
  const providers = createWebAgentShadowPersistenceProviders({
    store: seededStore(),
  });

  const commercial = await providers.commercialContext.resolve({
    tenantId: "tenant:001",
    workspaceId: "workspace:001",
    productId: "product:uni-co",
  });

  assert.deepEqual(commercial, { currency: "BRL" });

  await assert.rejects(
    providers.commercialContext.resolve({
      tenantId: "tenant:001",
      workspaceId: "workspace:002",
      productId: "product:uni-co",
    }),
    /commercial context not found/,
  );
});

test("commercial context identifiers are deterministic and partition product/workspace", () => {
  const first = createWebAgentShadowCommercialContextId({
    tenantId: "tenant:001",
    workspaceId: "workspace:001",
    productId: "product:uni-co",
  });
  const same = createWebAgentShadowCommercialContextId({
    tenantId: "tenant:001",
    workspaceId: "workspace:001",
    productId: "product:uni-co",
  });
  const otherProduct = createWebAgentShadowCommercialContextId({
    tenantId: "tenant:001",
    workspaceId: "workspace:001",
    productId: "product:nexus",
  });

  assert.equal(first, same);
  assert.notEqual(first, otherProduct);
  assert.match(first, /^web-commercial\.[a-f0-9]{64}$/);
});

test("missing tenant profiles fail closed", async () => {
  const providers = createWebAgentShadowPersistenceProviders({
    store: createStore(),
  });

  await assert.rejects(
    providers.tenantInternationalProfile.resolve({ tenantId: "tenant:404" }),
    /tenant international profile not found/,
  );
});
