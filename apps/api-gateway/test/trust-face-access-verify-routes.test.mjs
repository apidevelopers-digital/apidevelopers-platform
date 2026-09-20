import assert from "node:assert/strict";
import test from "node:test";

import { createApp } from "../src/server.mjs";

function parse(response) {
  return JSON.parse(response.body);
}

function createMockTrustFaceAccess() {
  const calls = [];

  return {
    calls,
    service: {
      status() {
        return {
          service: "trust-face-access",
          status: "preview",
          mode: "passkeys_webauthn",
        };
      },
      createRegistrationOptions() {
        throw new Error("registration options route should not be called");
      },
      createAuthenticationOptions() {
        throw new Error("authentication options route should not be called");
      },
      verifyRegistrationPreview(payload) {
        calls.push(["register", payload]);
        return {
          registered: true,
          credentialId: payload.credentialId,
          mode: "preview_without_attestation_verification",
        };
      },
      verifyAuthenticationPreview(payload) {
        calls.push(["authenticate", payload]);
        return {
          authenticated: true,
          userId: payload.userId,
          credentialId: payload.credentialId,
          mode: "preview_without_assertion_signature_verification",
        };
      },
    },
  };
}

test("POST /v1/trust/face-access/register/verify is routed through the API gateway", async () => {
  const trustFaceAccess = createMockTrustFaceAccess();
  const app = createApp({ trustFaceAccess: trustFaceAccess.service });

  const response = await app.handleRequest({
    method: "POST",
    url: "/v1/trust/face-access/register/verify",
    body: JSON.stringify({
      userId: "igor",
      challenge: "challenge-1",
      credentialId: "credential-1",
      transports: ["internal"],
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(parse(response), {
    registered: true,
    credentialId: "credential-1",
    mode: "preview_without_attestation_verification",
  });
  assert.deepEqual(trustFaceAccess.calls, [
    [
      "register",
      {
        userId: "igor",
        challenge: "challenge-1",
        credentialId: "credential-1",
        transports: ["internal"],
      },
    ],
  ]);
});

test("POST /v1/trust/face-access/authenticate/verify is routed through the API gateway", async () => {
  const trustFaceAccess = createMockTrustFaceAccess();
  const app = createApp({ trustFaceAccess: trustFaceAccess.service });

  const response = await app.handleRequest({
    method: "POST",
    url: "/v1/trust/face-access/authenticate/verify",
    body: JSON.stringify({
      userId: "igor",
      challenge: "challenge-2",
      credentialId: "credential-1",
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(parse(response), {
    authenticated: true,
    userId: "igor",
    credentialId: "credential-1",
    mode: "preview_without_assertion_signature_verification",
  });
  assert.deepEqual(trustFaceAccess.calls, [
    [
      "authenticate",
      {
        userId: "igor",
        challenge: "challenge-2",
        credentialId: "credential-1",
      },
    ],
  ]);
});
