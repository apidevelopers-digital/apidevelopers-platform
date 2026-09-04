import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  browserSessionHandoffIssuePath,
  browserSessionHandoffRedeemPath,
} from "../src/browser-session-handoff-http.mjs";

import {
  UNI_ACCOUNT_PREVIEW_HANDOFF_TARGET_ORIGIN,
  createUniAccountPreviewHandoffComposition,
} from "../src/browser-session-handoff-preview-composition.mjs";

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
      if (headers.cookie !== "__Host-apidevelopers-session=preview-session") {
        return null;
      }
      return {
        role: "client",
        principal: {
          id: "acct_preview",
          tenantId: "tenant_preview",
          name: "Cliente Preview",
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
      if (headers["x-preview-redeemer"] !== "allowed") return null;
      return {
        role: "server",
        principal: { id: "site-uni-preview" },
      };
    },
  };
}

const verifier = "v".repeat(43);
const challenge = createHash("sha256")
  .update(verifier, "utf8")
  .digest("base64url");

test("preview handoff composition is disabled by default and delegates unchanged", async () => {
  const app = createBaseApp();
  const composition = createUniAccountPreviewHandoffComposition({ app });

  assert.equal(composition.enabled, false);
  assert.equal(composition.app, app);
  assert.deepEqual(composition.descriptor, {
    mode: "preview-only",
    targetOrigin: UNI_ACCOUNT_PREVIEW_HANDOFF_TARGET_ORIGIN,
    productionEnabled: false,
    persistence: "not-configured",
  });
});

test("preview handoff fixes target origin and completes S256 one-time redemption", async () => {
  const composition = createUniAccountPreviewHandoffComposition({
    app: createBaseApp(),
    persistenceStore: createSerialPersistenceStore(),
    sourceAuthenticator: sourceAuthenticator(),
    redeemerAuthenticator: redeemerAuthenticator(),
    enabled: true,
    ttlSeconds: 60,
  });

  assert.equal(composition.enabled, true);
  assert.equal(composition.descriptor.productionEnabled, false);
  assert.equal(composition.descriptor.targetOrigin, UNI_ACCOUNT_PREVIEW_HANDOFF_TARGET_ORIGIN);
  assert.equal(composition.descriptor.persistence, "persistence-core");
  assert.equal(composition.descriptor.browserBinding, "S256");
  assert.equal(composition.descriptor.runtimeAutoWiring, false);

  const issue = await composition.app.handleRequest({
    method: "POST",
    url: browserSessionHandoffIssuePath,
    headers: {
      cookie: "__Host-apidevelopers-session=preview-session",
    },
    body: JSON.stringify({
      targetOrigin: UNI_ACCOUNT_PREVIEW_HANDOFF_TARGET_ORIGIN,
      codeChallenge: challenge,
    }),
  });

  assert.equal(issue.status, 200);
  const issued = JSON.parse(issue.body);
  assert.equal(issued.ok, true);
  assert.equal(issued.handoff.targetOrigin, UNI_ACCOUNT_PREVIEW_HANDOFF_TARGET_ORIGIN);
  assert.equal(typeof issued.handoff.code, "string");

  const redeem = await composition.app.handleRequest({
    method: "POST",
    url: browserSessionHandoffRedeemPath,
    headers: {
      "x-preview-redeemer": "allowed",
    },
    body: JSON.stringify({
      code: issued.handoff.code,
      codeVerifier: verifier,
      targetOrigin: "https://attacker.example",
    }),
  });

  assert.equal(redeem.status, 200);
  const redeemed = JSON.parse(redeem.body);
  assert.equal(redeemed.ok, true);
  assert.equal(redeemed.authenticated, true);
  assert.equal(redeemed.principal.id, "acct_preview");
  assert.equal(
    redeemed.source.targetOrigin,
    UNI_ACCOUNT_PREVIEW_HANDOFF_TARGET_ORIGIN,
  );

  const replay = await composition.app.handleRequest({
    method: "POST",
    url: browserSessionHandoffRedeemPath,
    headers: {
      "x-preview-redeemer": "allowed",
    },
    body: JSON.stringify({
      code: issued.handoff.code,
      codeVerifier: verifier,
    }),
  });

  assert.equal(replay.status, 401);
  const replayBody = JSON.parse(replay.body);
  assert.equal(replayBody.authenticated, false);
  assert.equal(replayBody.error, "handoff_invalid_expired_or_redeemed");
});

test("preview handoff refuses enablement when persistence or authenticators are absent", () => {
  assert.throws(
    () =>
      createUniAccountPreviewHandoffComposition({
        app: createBaseApp(),
        enabled: true,
      }),
    /sourceAuthenticator\.authenticate is required/,
  );

  assert.throws(
    () =>
      createUniAccountPreviewHandoffComposition({
        app: createBaseApp(),
        enabled: true,
        sourceAuthenticator: sourceAuthenticator(),
        redeemerAuthenticator: redeemerAuthenticator(),
      }),
    /persistenceStore\.transaction must be a function/,
  );
});

test("preview handoff does not intercept unrelated routes", async () => {
  const composition = createUniAccountPreviewHandoffComposition({
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
