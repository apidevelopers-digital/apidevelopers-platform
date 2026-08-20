import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveUniCoPreviewBootstrapConfig,
  runUniCoPreviewBootstrap,
  uniCoPreviewBootstrapContract,
} from "../src/uni-co-preview-bootstrap.mjs";

const SUBJECT = "a".repeat(64);
const KEY = "provisioning-secret-1234567890abcdef";

test("bootstrap is disabled by default and never provisions during login", async () => {
  let calls = 0;
  const app = {
    async handleRequest() {
      calls += 1;
      throw new Error("must not execute");
    },
  };

  const result = await runUniCoPreviewBootstrap({ app, env: {} });
  assert.equal(result.executed, false);
  assert.equal(result.automaticLoginProvisioning, false);
  assert.equal(calls, 0);
  assert.equal(uniCoPreviewBootstrapContract.automaticLoginProvisioning, false);
});

test("explicit bootstrap uses the governed provisioning route with fixed uni.co binding", async () => {
  let captured;
  const logs = [];
  const app = {
    async handleRequest(request) {
      captured = structuredClone(request);
      return {
        status: 201,
        body: JSON.stringify({
          ok: true,
          tenantId: "component.tenant.apidevelopers-digital",
          workspaceId: "component.workspace.apidevelopers-digital.uni-co-preview",
          principalId: "component.principal.0123456789abcdef0123456789abcdef",
          accessGrantId: "component.access-grant.apidevelopers-digital.uni-co-preview.uni-co.0123456789abcdef0123456789abcdef",
          productId: "product:uni-co",
          status: "active",
        }),
      };
    },
  };

  const result = await runUniCoPreviewBootstrap({
    app,
    env: {
      UNI_CO_PREVIEW_BOOTSTRAP_ENABLED: "true",
      UNI_CO_PREVIEW_BOOTSTRAP_SUBJECT_REF: SUBJECT,
      API_GATEWAY_PROVISIONING_KEY: KEY,
    },
    logger: { log(value) { logs.push(String(value)); } },
  });

  assert.equal(captured.method, "POST");
  assert.equal(captured.url, "/v1/saas/uni-co/provision");
  assert.equal(captured.headers.authorization, `Bearer ${KEY}`);
  assert.deepEqual(captured.body, {
    tenantSlug: "apidevelopers-digital",
    workspaceSlug: "uni-co-preview",
    displayName: "API Developers.digital Preview",
    subjectRef: SUBJECT,
    idempotencyKey: "uni-co-preview-bootstrap-v1",
  });
  assert.equal(result.status, "active");
  assert.equal(result.productId, "product:uni-co");
  assert.equal(result.secretsExposed, false);
  assert.equal(result.automaticLoginProvisioning, false);
  assert.equal(logs.some((line) => line.includes(KEY)), false);
  assert.equal(logs.some((line) => line.includes(SUBJECT)), false);
});

test("enabled bootstrap fails closed without a valid subject ref or provisioning key", () => {
  assert.throws(
    () => resolveUniCoPreviewBootstrapConfig({
      UNI_CO_PREVIEW_BOOTSTRAP_ENABLED: "true",
      API_GATEWAY_PROVISIONING_KEY: KEY,
      UNI_CO_PREVIEW_BOOTSTRAP_SUBJECT_REF: "not-a-hash",
    }),
    /64-character lowercase SHA-256/,
  );

  assert.throws(
    () => resolveUniCoPreviewBootstrapConfig({
      UNI_CO_PREVIEW_BOOTSTRAP_ENABLED: "true",
      UNI_CO_PREVIEW_BOOTSTRAP_SUBJECT_REF: SUBJECT,
    }),
    /API_GATEWAY_PROVISIONING_KEY is required/,
  );
});

test("bootstrap rejects non-active provisioning responses without logging secrets", async () => {
  const logs = [];
  const app = {
    async handleRequest() {
      return {
        status: 409,
        body: JSON.stringify({ ok: false, reason: "provisioning_failed" }),
      };
    },
  };

  await assert.rejects(
    runUniCoPreviewBootstrap({
      app,
      env: {
        UNI_CO_PREVIEW_BOOTSTRAP_ENABLED: "true",
        UNI_CO_PREVIEW_BOOTSTRAP_SUBJECT_REF: SUBJECT,
        API_GATEWAY_PROVISIONING_KEY: KEY,
      },
      logger: { log(value) { logs.push(String(value)); } },
    }),
    /uni_co_preview_bootstrap_failed:409:provisioning_failed/,
  );

  assert.equal(logs.some((line) => line.includes(KEY)), false);
  assert.equal(logs.some((line) => line.includes(SUBJECT)), false);
});
