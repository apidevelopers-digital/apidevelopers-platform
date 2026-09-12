import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  hashBrowserSessionSecret,
} from "@apidevelopers/auth-core/browser-session-authenticator";
import { createJsonFileStore } from "@apidevelopers/persistence-core";

import {
  browserSessionHandoffRedeemPath,
} from "../src/browser-session-handoff-http.mjs";
import {
  uniAccountPreviewAuthorizePath,
  uniAccountPreviewCallbackUrl,
} from "../src/uni-account-preview-authorize-http.mjs";
import {
  createUniAccountPreviewRuntimeComposition,
} from "../src/uni-account-preview-runtime-composition.mjs";
import {
  webAgentShadowPersistenceCollections,
} from "../src/web-agent-shadow-persistence-providers.mjs";

const SESSION_SECRET = "A".repeat(43);
const STATE = "s".repeat(43);
const VERIFIER = "v".repeat(43);
const CHALLENGE = createHash("sha256")
  .update(VERIFIER, "utf8")
  .digest("base64url");
const REDEEMER_AUTHORIZATION = `Bearer ${"R".repeat(48)}`;

function baseApp() {
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

function loginBootstrap() {
  return Object.freeze({
    async login() {
      return Object.freeze({
        setCookie:
          "__Host-apidevelopers-session=opaque; Path=/; HttpOnly; Secure; SameSite=Lax",
      });
    },
  });
}

async function putBrowserSession(store) {
  const sessionHash = hashBrowserSessionSecret(SESSION_SECRET);
  await store.transaction(async (tx) => {
    tx.put(
      webAgentShadowPersistenceCollections.browserSessions,
      sessionHash,
      {
        sessionHash,
        status: "active",
        expiresAt: "2099-01-01T00:00:00.000Z",
        principal: {
          id: "component.principal.0123456789abcdef0123456789abcdef",
          tenantId: "component.tenant.cliente-preview",
          name: "Cliente Preview",
          status: "active",
          scopes: ["web:chat"],
        },
      },
      { ifAbsent: true },
    );
  });
}

test("runtime composition stays disabled without dedicated redeem authorization", async () => {
  const app = baseApp();
  const composition = createUniAccountPreviewRuntimeComposition({
    app,
    enabled: true,
    store: {
      read: async () => ({}),
      transaction: async () => ({ result: null }),
    },
    loginBootstrap: loginBootstrap(),
  });

  assert.equal(composition.enabled, false);
  assert.equal(composition.app, app);
  assert.equal(composition.descriptor.redeemerConfigured, false);
  assert.equal(composition.descriptor.productionEnabled, false);
});

test("runtime composition authenticates browser session, issues S256 handoff, redeems once with dedicated server auth", async () => {
  const dir = await mkdtemp(join(tmpdir(), "uni-account-preview-runtime-"));
  try {
    const store = createJsonFileStore({
      filePath: join(dir, "state.json"),
      fsync: false,
    });
    await putBrowserSession(store);

    const composition = createUniAccountPreviewRuntimeComposition({
      app: baseApp(),
      store,
      loginBootstrap: loginBootstrap(),
      redeemerAuthorization: REDEEMER_AUTHORIZATION,
      enabled: true,
      ttlSeconds: 60,
    });

    assert.equal(composition.enabled, true);
    assert.equal(composition.descriptor.redeemerConfigured, true);
    assert.equal(composition.descriptor.browserBinding, "S256");
    assert.equal(composition.descriptor.oneTimeRedemptionRequired, true);
    assert.equal(composition.descriptor.productionEnabled, false);

    const authorize = await composition.app.handleRequest({
      method: "GET",
      url: `${uniAccountPreviewAuthorizePath}?state=${STATE}&code_challenge=${CHALLENGE}`,
      headers: {
        cookie: `__Host-apidevelopers-session=${SESSION_SECRET}`,
      },
    });

    assert.equal(authorize.status, 303);
    const redirect = new URL(authorize.headers.location);
    const expectedCallback = new URL(uniAccountPreviewCallbackUrl);
    assert.equal(
      redirect.origin + redirect.pathname,
      expectedCallback.origin + expectedCallback.pathname,
    );
    assert.equal(redirect.searchParams.get("state"), STATE);
    const code = redirect.searchParams.get("code");
    assert.equal(typeof code, "string");
    assert.ok(code.length >= 43);

    const denied = await composition.app.handleRequest({
      method: "POST",
      url: browserSessionHandoffRedeemPath,
      headers: {
        authorization: "Bearer wrong",
      },
      body: JSON.stringify({
        code,
        codeVerifier: VERIFIER,
      }),
    });
    assert.equal(denied.status, 401);

    const redeem = await composition.app.handleRequest({
      method: "POST",
      url: browserSessionHandoffRedeemPath,
      headers: {
        authorization: REDEEMER_AUTHORIZATION,
      },
      body: JSON.stringify({
        code,
        codeVerifier: VERIFIER,
      }),
    });

    assert.equal(redeem.status, 200);
    const body = JSON.parse(redeem.body);
    assert.equal(body.ok, true);
    assert.equal(body.authenticated, true);
    assert.equal(
      body.principal.id,
      "component.principal.0123456789abcdef0123456789abcdef",
    );
    assert.equal(body.principal.tenantId, "component.tenant.cliente-preview");
    assert.deepEqual(body.principal.scopes, ["web:chat"]);

    const replay = await composition.app.handleRequest({
      method: "POST",
      url: browserSessionHandoffRedeemPath,
      headers: {
        authorization: REDEEMER_AUTHORIZATION,
      },
      body: JSON.stringify({
        code,
        codeVerifier: VERIFIER,
      }),
    });

    assert.equal(replay.status, 401);
    assert.equal(
      JSON.parse(replay.body).error,
      "handoff_invalid_expired_or_redeemed",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
