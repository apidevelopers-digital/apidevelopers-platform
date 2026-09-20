import assert from "node:assert/strict";
import test from "node:test";

import { createApp } from "../src/server.mjs";

function parse(response) {
  return JSON.parse(response.body);
}

test("GET /v1/trust/face-access/status exposes preview service status", async () => {
  const app = createApp({
    trustFaceAccess: {
      status() {
        return {
          service: "trust-face-access",
          status: "preview",
          mode: "passkeys_webauthn",
        };
      },
      createRegistrationOptions() {
        throw new Error("not expected");
      },
      createAuthenticationOptions() {
        throw new Error("not expected");
      },
    },
  });

  const response = await app.handleRequest({
    method: "GET",
    url: "/v1/trust/face-access/status",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(parse(response), {
    service: "trust-face-access",
    status: "preview",
    mode: "passkeys_webauthn",
  });
});

test("POST /v1/trust/face-access/register/options forwards registration payload", async () => {
  const calls = [];
  const app = createApp({
    trustFaceAccess: {
      status() {
        throw new Error("not expected");
      },
      createRegistrationOptions(payload) {
        calls.push(payload);
        return {
          publicKey: {
            challenge: "challenge-1",
            user: {
              id: "user-handle-1",
              name: payload.userName,
              displayName: payload.displayName,
            },
          },
        };
      },
      createAuthenticationOptions() {
        throw new Error("not expected");
      },
    },
  });

  const response = await app.handleRequest({
    method: "POST",
    url: "/v1/trust/face-access/register/options",
    body: JSON.stringify({
      userId: "igor",
      userName: "igor@apidevelopers.digital",
      displayName: "Igor",
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [
    {
      userId: "igor",
      userName: "igor@apidevelopers.digital",
      displayName: "Igor",
    },
  ]);
  assert.equal(parse(response).publicKey.challenge, "challenge-1");
});

test("POST /v1/trust/face-access/authenticate/options forwards authentication payload", async () => {
  const calls = [];
  const app = createApp({
    trustFaceAccess: {
      status() {
        throw new Error("not expected");
      },
      createRegistrationOptions() {
        throw new Error("not expected");
      },
      createAuthenticationOptions(payload) {
        calls.push(payload);
        return {
          publicKey: {
            challenge: "challenge-2",
            rpId: "apidevelopers.digital",
            allowCredentials: [],
            userVerification: "required",
          },
        };
      },
    },
  });

  const response = await app.handleRequest({
    method: "POST",
    url: "/v1/trust/face-access/authenticate/options",
    body: JSON.stringify({ userId: "igor" }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [{ userId: "igor" }]);
  assert.equal(parse(response).publicKey.challenge, "challenge-2");
});

test("Trust Face Access routes reject invalid JSON payloads at transport boundary", async () => {
  const app = createApp();

  await assert.rejects(
    () =>
      app.handleRequest({
        method: "POST",
        url: "/v1/trust/face-access/register/options",
        body: "{",
      }),
    /invalid_json_body/u,
  );
});

test("createApp rejects incomplete Trust Face Access composition", () => {
  assert.throws(
    () =>
      createApp({
        trustFaceAccess: {
          status() {},
          createRegistrationOptions() {},
        },
      }),
    /trustFaceAccess must expose/u,
  );
});
