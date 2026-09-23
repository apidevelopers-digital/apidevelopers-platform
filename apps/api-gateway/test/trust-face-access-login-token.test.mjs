import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { createInMemoryTrustFaceAccessDurableStore } from "../src/trust-face-access-durable-store.mjs";
import { createTrustFaceAccessDurableService } from "../src/trust-face-access-durable-service.mjs";

function decodeBase64UrlJson(value) {
  const normalized = String(value).replaceAll("-", "+").replaceAll("_", "/");
  return JSON.parse(Buffer.from(normalized + "=".repeat((4 - (normalized.length % 4)) % 4), "base64").toString("utf8"));
}

function sign(input, secret) {
  return Buffer.from(crypto.createHmac("sha256", secret).update(input).digest())
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

async function createRegisteredService(options = {}) {
  const secret = Object.prototype.hasOwnProperty.call(options, "secret") ? options.secret : "trust-secret";
  const store = createInMemoryTrustFaceAccessDurableStore({
    now: () => "2026-09-20T23:55:00.000Z",
  });
  const service = createTrustFaceAccessDurableService({
    store,
    trustLoginTokenSecret: secret,
    nowMs: () => Date.parse("2026-09-20T23:55:00.000Z"),
    nowIso: () => "2026-09-20T23:55:00.000Z",
  });

  const registration = await service.createRegistrationOptions({
    userId: "igor",
    userName: "igor@apidevelopers.digital",
  });

  await service.verifyRegistrationPreview({
    userId: "igor",
    userName: "igor@apidevelopers.digital",
    challenge: registration.publicKey.challenge,
    credentialId: "credential-1",
  });

  return service;
}

test("durable service issues signed Trust login token for allowed audience", async () => {
  const secret = "trust-secret";
  const service = await createRegisteredService({ secret });
  const authentication = await service.createAuthenticationOptions({ userId: "igor" });

  const result = await service.verifyAuthenticationPreview({
    userId: "igor",
    challenge: authentication.publicKey.challenge,
    credentialId: "credential-1",
    audience: "zuni",
    returnUrl: "https://zuni.sitedauni.com/trust-callback.php",
  });

  assert.equal(result.authenticated, true);
  assert.equal(result.trustLoginTokenType, "HS256_JWT");
  assert.equal(result.trustLoginTokenAudience, "zuni");
  assert.equal(result.trustLoginTokenReturnUrl, "https://zuni.sitedauni.com/trust-callback.php");
  assert.equal(result.trustLoginTokenExpiresAt, "2026-09-21T00:00:00.000Z");

  const parts = result.trustLoginToken.split(".");
  assert.equal(parts.length, 3);
  assert.deepEqual(decodeBase64UrlJson(parts[0]), { alg: "HS256", typ: "JWT" });

  const payload = decodeBase64UrlJson(parts[1]);
  assert.equal(payload.iss, "api-developers-trust");
  assert.equal(payload.aud, "zuni");
  assert.equal(payload.purpose, "session_exchange");
  assert.equal(payload.sub, "igor");
  assert.equal(payload.email, "igor@apidevelopers.digital");
  assert.equal(payload.credentialId, "credential-1");
  assert.equal(payload.returnUrl, "https://zuni.sitedauni.com/trust-callback.php");
  assert.equal(payload.iat, 1789948500);
  assert.equal(payload.exp, 1789948800);
  assert.equal(typeof payload.nonce, "string");

  assert.equal(parts[2], sign(`${parts[0]}.${parts[1]}`, secret));
});

test("durable service rejects Trust login token issuance without configured secret", async () => {
  const service = await createRegisteredService({ secret: "" });
  const authentication = await service.createAuthenticationOptions({ userId: "igor" });

  await assert.rejects(
    () =>
      service.verifyAuthenticationPreview({
        userId: "igor",
        challenge: authentication.publicKey.challenge,
        credentialId: "credential-1",
        audience: "zuni",
      }),
    /trust_login_token_secret_not_configured/u,
  );
});

test("durable service rejects unapproved Trust return URL", async () => {
  const service = await createRegisteredService();
  const authentication = await service.createAuthenticationOptions({ userId: "igor" });

  await assert.rejects(
    () =>
      service.verifyAuthenticationPreview({
        userId: "igor",
        challenge: authentication.publicKey.challenge,
        credentialId: "credential-1",
        audience: "zuni",
        returnUrl: "https://evil.example/callback",
      }),
    /trust_login_return_url_not_allowed/u,
  );
});
