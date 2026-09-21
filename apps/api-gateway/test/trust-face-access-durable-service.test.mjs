import assert from "node:assert/strict";
import test from "node:test";

import { createInMemoryTrustFaceAccessDurableStore } from "../src/trust-face-access-durable-store.mjs";
import { createTrustFaceAccessDurableService } from "../src/trust-face-access-durable-service.mjs";

test("durable service creates registration options and stores credential descriptors", async () => {
  const store = createInMemoryTrustFaceAccessDurableStore({
    now: () => "2026-09-20T23:55:00.000Z",
  });
  const service = createTrustFaceAccessDurableService({
    store,
    nowMs: () => Date.parse("2026-09-20T23:55:00.000Z"),
    nowIso: () => "2026-09-20T23:55:00.000Z",
  });

  const options = await service.createRegistrationOptions({
    userId: "igor",
    userName: "igor@apidevelopers.digital",
    displayName: "Igor",
  });

  assert.equal(options.publicKey.rp.id, "apidevelopers.digital");
  assert.equal(options.publicKey.user.name, "igor@apidevelopers.digital");
  assert.equal(options.publicKey.authenticatorSelection.userVerification, "required");
  assert.deepEqual(options.publicKey.excludeCredentials, []);

  const result = await service.verifyRegistrationPreview({
    userId: "igor",
    userName: "igor@apidevelopers.digital",
    displayName: "Igor",
    challenge: options.publicKey.challenge,
    credentialId: "credential-1",
    transports: ["internal"],
    publicKey: "public-key",
  });

  assert.deepEqual(result, {
    registered: true,
    credentialId: "credential-1",
    mode: "durable_preview_without_attestation_verification",
  });

  const nextOptions = await service.createRegistrationOptions({
    userId: "igor",
    userName: "igor@apidevelopers.digital",
  });

  assert.deepEqual(nextOptions.publicKey.excludeCredentials, [
    {
      type: "public-key",
      id: "credential-1",
      transports: ["internal"],
    },
  ]);
});

test("durable service authenticates registered credentials with one-time challenges", async () => {
  const store = createInMemoryTrustFaceAccessDurableStore({
    now: () => "2026-09-20T23:55:00.000Z",
  });
  const service = createTrustFaceAccessDurableService({
    store,
    nowMs: () => Date.parse("2026-09-20T23:55:00.000Z"),
    nowIso: () => "2026-09-20T23:55:00.000Z",
  });

  const registration = await service.createRegistrationOptions({
    userId: "igor",
    userName: "igor@apidevelopers.digital",
  });

  await service.verifyRegistrationPreview({
    userId: "igor",
    challenge: registration.publicKey.challenge,
    credentialId: "credential-1",
  });

  const authentication = await service.createAuthenticationOptions({ userId: "igor" });
  assert.deepEqual(authentication.publicKey.allowCredentials, [
    {
      type: "public-key",
      id: "credential-1",
      transports: [],
    },
  ]);

  const result = await service.verifyAuthenticationPreview({
    userId: "igor",
    challenge: authentication.publicKey.challenge,
    credentialId: "credential-1",
  });

  assert.deepEqual(result, {
    authenticated: true,
    userId: "igor",
    credentialId: "credential-1",
    mode: "durable_preview_without_assertion_signature_verification",
  });

  await assert.rejects(
    () =>
      service.verifyAuthenticationPreview({
        userId: "igor",
        challenge: authentication.publicKey.challenge,
        credentialId: "credential-1",
      }),
    /challenge_not_found/u,
  );
});

test("durable service rejects unknown credentials", async () => {
  const store = createInMemoryTrustFaceAccessDurableStore({
    now: () => "2026-09-20T23:55:00.000Z",
  });
  const service = createTrustFaceAccessDurableService({
    store,
    nowMs: () => Date.parse("2026-09-20T23:55:00.000Z"),
  });

  const authentication = await service.createAuthenticationOptions({ userId: "igor" });

  await assert.rejects(
    () =>
      service.verifyAuthenticationPreview({
        userId: "igor",
        challenge: authentication.publicKey.challenge,
        credentialId: "missing",
      }),
    /credential_not_found/u,
  );
});

test("durable service reports durable preview status", () => {
  const service = createTrustFaceAccessDurableService();

  assert.deepEqual(service.status(), {
    service: "trust-face-access",
    status: "durable_preview",
    mode: "passkeys_webauthn",
    rpId: "apidevelopers.digital",
    origin: "https://trust.apidevelopers.digital",
    storesBiometricTemplate: false,
    storesFaceImage: false,
    storesPublicCredentials: true,
  });
});
