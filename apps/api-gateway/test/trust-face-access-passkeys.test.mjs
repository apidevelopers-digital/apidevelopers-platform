import assert from "node:assert/strict";
import test from "node:test";

import {
  TrustFaceAccessError,
  createInMemoryTrustFaceAccessStore,
  createTrustFaceAccessService,
  fromBase64Url,
  toBase64Url,
} from "../src/trust-face-access-passkeys.mjs";

test("base64url helpers round-trip binary values", () => {
  const input = Buffer.from("trust-face-access");
  const encoded = toBase64Url(input);

  assert.equal(encoded.includes("+"), false);
  assert.equal(encoded.includes("/"), false);
  assert.equal(encoded.includes("="), false);
  assert.deepEqual(fromBase64Url(encoded), input);
});

test("registration options use platform authenticators and required user verification", () => {
  const service = createTrustFaceAccessService({
    rpId: "apidevelopers.digital",
    origin: "https://trust.apidevelopers.digital",
  });

  const options = service.createRegistrationOptions({
    userId: "igor",
    userName: "igor@apidevelopers.digital",
    displayName: "Igor",
  });

  assert.equal(options.publicKey.rp.id, "apidevelopers.digital");
  assert.equal(options.publicKey.authenticatorSelection.authenticatorAttachment, "platform");
  assert.equal(options.publicKey.authenticatorSelection.userVerification, "required");
  assert.equal(options.publicKey.attestation, "none");
});

test("registration preview consumes challenges once and stores credential descriptors", () => {
  let currentTime = Date.parse("2026-09-19T21:30:00-03:00");
  const store = createInMemoryTrustFaceAccessStore({ now: () => currentTime });
  const service = createTrustFaceAccessService({ store, now: () => currentTime });

  const options = service.createRegistrationOptions({
    userId: "igor",
    userName: "igor@apidevelopers.digital",
  });

  const result = service.registerCredentialPreview({
    userId: "igor",
    challenge: options.publicKey.challenge,
    credentialId: "credential-1",
    transports: ["internal"],
  });

  assert.equal(result.registered, true);

  assert.throws(
    () =>
      service.registerCredentialPreview({
        userId: "igor",
        challenge: options.publicKey.challenge,
        credentialId: "credential-2",
      }),
    TrustFaceAccessError,
  );

  const authentication = service.createAuthenticationOptions({ userId: "igor" });
  assert.deepEqual(authentication.publicKey.allowCredentials, [
    {
      type: "public-key",
      id: "credential-1",
      transports: ["internal"],
    },
  ]);
});

test("expired challenges are rejected", () => {
  let currentTime = 0;
  const store = createInMemoryTrustFaceAccessStore({ now: () => currentTime });
  const service = createTrustFaceAccessService({ store, now: () => currentTime, timeoutMs: 10 });

  const options = service.createRegistrationOptions({
    userId: "igor",
    userName: "igor@apidevelopers.digital",
  });

  currentTime = 11;

  assert.throws(
    () =>
      service.registerCredentialPreview({
        userId: "igor",
        challenge: options.publicKey.challenge,
        credentialId: "credential-1",
      }),
    /challenge_not_found/u,
  );
});
