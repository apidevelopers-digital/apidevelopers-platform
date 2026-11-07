import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  browserSessionHandoffIssuePath,
  browserSessionHandoffRedeemPath,
} from "../src/browser-session-handoff-http.mjs";

import {
  UNIJURI_PRODUCTION_HANDOFF_TARGET_ORIGIN,
  createUniJuriProductionHandoffComposition,
} from "../src/browser-session-handoff-production-composition.mjs";

function createBaseApp() {
  return Object.freeze({
    async handleRequest(request = {}) {
      return Object.freeze({
        status: 404,
        headers: Object.freeze({ "content-type": "application/json" }),
        body: JSON.stringify({ delegated: true, url: request.url ?? "/" }),
      });
    },
  });
}

function createSerialPersistenceStore() {
  const state = { collections: {} };
  let tail = Promise.resolve();

  return {
    async transaction(work) {
      const run = async () => {
        const draft = structuredClone(state);
        const tx = {
          get(collectionName, id) {
            const records = draft.collections[collectionName] ?? {};
            return records[id] === undefined ? null : structuredClone(records[id]);
          },
          put(collectionName, id, value, { ifAbsent = false } = {}) {
            draft.collections[collectionName] ??= {};
            const records = draft.collections[collectionName];
            if (ifAbsent && records[id] !== undefined) {
              const error = new Error("record_conflict");
              error.code = "record_conflict";
              throw error;
            }
            records[id] = structuredClone(value);
            return structuredClone(value);
          },
          delete(collectionName, id) {
            draft.collections[collectionName] ??= {};
            const records = draft.collections[collectionName];
            const existed = records[id] !== undefined;
            delete records[id];
            return existed;
          },
        };

        const result = await work(tx);
        state.collections = draft.collections;
        return { result, revision: 1 };
      };

      const next = tail.then(run, run);
      tail = next.then(() => undefined, () => undefined);
      return next;
    },
  };
}

function sourceAuthenticator() {
  return {
    async authenticate(headers = {}) {
      if (headers.cookie !== "__Host-apidevelopers-session=production-session") {
        return null;
      }
      return {
        role: "client",
        principal: {
          id: "acct_prod",
          tenantId: "tenant_prod",
          name: "Cliente Produção",
          status: "active",
          scopes: ["web:chat"],
          authenticationMethod: "browser_session",
        },
      };
    },
  };
}

function redeemerAuthenticator() {
  return {
    async authenticate(headers = {}) {
      if (headers.authorization !== "Bearer unijuri-redeemer") return null;
      return {
        role: "server",
        principal: { id: "unijuri-production" },
      };
    },
  };
}

const verifier = "v".repeat(43);
const challenge = createHash("sha256")
  .update(verifier, "utf8")
  .digest("base64url");

test("production handoff contract is dormant by default", () => {
  const app = createBaseApp();
  const composition = createUniJuriProductionHandoffComposition({ app });

  assert.equal(composition.enabled, false);
  assert.equal(composition.app, app);
  assert.deepEqual(composition.descriptor, {
    mode: "production-contract",
    targetOrigin: UNIJURI_PRODUCTION_HANDOFF_TARGET_ORIGIN,
    productionEnabled: false,
    persistence: "not-configured",
    browserBinding: "S256",
    oneTimeRedemptionRequired: true,
    redeemerServerAuthenticationRequired: true,
    runtimeAutoWiring: false,
  });
});

test("enabled contract fixes target to UniJuri and enforces one-time S256 redemption", async () => {
  const composition = createUniJuriProductionHandoffComposition({
    app: createBaseApp(),
    persistenceStore: createSerialPersistenceStore(),
    sourceAuthenticator: sourceAuthenticator(),
    redeemerAuthenticator: redeemerAuthenticator(),
    enabled: true,
    ttlSeconds: 60,
  });

  assert.equal(composition.enabled, true);
  assert.equal(composition.descriptor.productionEnabled, true);
  assert.equal(
    composition.descriptor.targetOrigin,
    UNIJURI_PRODUCTION_HANDOFF_TARGET_ORIGIN,
  );
  assert.equal(composition.descriptor.runtimeAutoWiring, false);

  const issue = await composition.app.handleRequest({
    method: "POST",
    url: browserSessionHandoffIssuePath,
    headers: {
      cookie: "__Host-apidevelopers-session=production-session",
    },
    body: JSON.stringify({
      targetOrigin: UNIJURI_PRODUCTION_HANDOFF_TARGET_ORIGIN,
      codeChallenge: challenge,
    }),
  });

  assert.equal(issue.status, 200);
  const issued = JSON.parse(issue.body);
  assert.equal(issued.ok, true);
  assert.equal(
    issued.handoff.targetOrigin,
    UNIJURI_PRODUCTION_HANDOFF_TARGET_ORIGIN,
  );

  const unauthorized = await composition.app.handleRequest({
    method: "POST",
    url: browserSessionHandoffRedeemPath,
    headers: {},
    body: JSON.stringify({
      code: issued.handoff.code,
      codeVerifier: verifier,
    }),
  });
  assert.equal(unauthorized.status, 401);

  const redeem = await composition.app.handleRequest({
    method: "POST",
    url: browserSessionHandoffRedeemPath,
    headers: { authorization: "Bearer unijuri-redeemer" },
    body: JSON.stringify({
      code: issued.handoff.code,
      codeVerifier: verifier,
      targetOrigin: "https://attacker.example",
    }),
  });

  assert.equal(redeem.status, 200);
  const redeemed = JSON.parse(redeem.body);
  assert.equal(redeemed.authenticated, true);
  assert.equal(redeemed.principal.id, "acct_prod");
  assert.equal(
    redeemed.source.targetOrigin,
    UNIJURI_PRODUCTION_HANDOFF_TARGET_ORIGIN,
  );

  const replay = await composition.app.handleRequest({
    method: "POST",
    url: browserSessionHandoffRedeemPath,
    headers: { authorization: "Bearer unijuri-redeemer" },
    body: JSON.stringify({
      code: issued.handoff.code,
      codeVerifier: verifier,
    }),
  });

  assert.equal(replay.status, 401);
  assert.equal(
    JSON.parse(replay.body).error,
    "handoff_invalid_expired_or_redeemed",
  );
});

test("issue rejects every target origin except canonical UniJuri production", async () => {
  const composition = createUniJuriProductionHandoffComposition({
    app: createBaseApp(),
    persistenceStore: createSerialPersistenceStore(),
    sourceAuthenticator: sourceAuthenticator(),
    redeemerAuthenticator: redeemerAuthenticator(),
    enabled: true,
  });

  const response = await composition.app.handleRequest({
    method: "POST",
    url: browserSessionHandoffIssuePath,
    headers: {
      cookie: "__Host-apidevelopers-session=production-session",
    },
    body: JSON.stringify({
      targetOrigin: "https://attacker.example",
      codeChallenge: challenge,
    }),
  });

  assert.equal(response.status, 403);
  assert.equal(JSON.parse(response.body).error, "handoff_target_not_allowed");
});

test("production contract refuses enablement without explicit runtime dependencies", () => {
  assert.throws(
    () =>
      createUniJuriProductionHandoffComposition({
        app: createBaseApp(),
        enabled: true,
      }),
    /sourceAuthenticator\.authenticate is required/,
  );

  assert.throws(
    () =>
      createUniJuriProductionHandoffComposition({
        app: createBaseApp(),
        enabled: true,
        sourceAuthenticator: sourceAuthenticator(),
        redeemerAuthenticator: redeemerAuthenticator(),
      }),
    /persistenceStore\.transaction must be a function/,
  );
});

test("production contract does not intercept unrelated routes", async () => {
  const composition = createUniJuriProductionHandoffComposition({
    app: createBaseApp(),
    persistenceStore: createSerialPersistenceStore(),
    sourceAuthenticator: sourceAuthenticator(),
    redeemerAuthenticator: redeemerAuthenticator(),
    enabled: true,
  });

  const result = await composition.app.handleRequest({
    method: "GET",
    url: "/health",
  });

  assert.equal(result.status, 404);
  assert.deepEqual(JSON.parse(result.body), {
    delegated: true,
    url: "/health",
  });
});
