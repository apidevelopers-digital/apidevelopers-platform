import assert from "node:assert/strict";
import test from "node:test";

import { createApp } from "../src/server.mjs";

function parse(response) {
  return JSON.parse(response.body);
}

test("POST /v1/trust/face-access/register/verify is exposed through the API gateway", async () => {
  const app = createApp();

  const options = await app.handleRequest({
    method: "POST",
    url: "/v1/trust/face-access/register/options",
    body: JSON.stringify({
      userId: "igor",
      userName: "igor@apidevelopers.digital",
      displayName: "Igor",
    }),
  });

  const verify = await app.handleRequest({
    method: "POST",
    url: "/v1/trust/face-access/register/verify",
    body: JSON.stringify({
      userId: "igor",
      challenge: parse(options).publicKey.challenge,
      credentialId: "credential-1",
      transports: ["internal"],
    }),
  });

  assert.equal(verify.status, 200);
  assert.deepEqual(parse(verify), {
    registered: true,
    credentialId: "credential-1",
    mode: "preview_without_attestation_verification",
  });
});

test("POST /v1/trust/face-access/authenticate/verify is exposed through the API gateway", async () => {
  const app = createApp();

  const registerOptions = await app.handleRequest({
    method: "POST",
    url: "/v1/trust/face-access/register/options",
    body: JSON.stringify({
      userId: "igor",
      userName: "igor@apidevelopers.digital",
    }),
  });

  await app.handleRequest({
    method: "POST",
    url: "/v1/trust/face-access/register/verify",
    body: JSON.stringify {
      userId: "igor",
      challenge: parse(registerOptions).publicKey.challenge,
      credentialId: "credential-1",
    }),
  });

  const authOptions = await app.handleRequest({
    method: "POST",
    url: "/v1/trust/face-access/authenticate/options",
    body: JSON.stringify({ userId: "igor" }),
  });

  const verify = await app.handleRequest({
    method: "POST",
    url: "/v1/trust/face-access/authenticate/verify",
    body: JSON.stringify({
      userId: "igor",
      challenge: parse(authOptions).publicKey.challenge,
      credentialId: "credential-1",
    }),
  });

  assert.equal(verify.status, 200);
  assert.deepEqual(parse(verify), {
    authenticated: true,
    userId: "igor",
    credentialId: "credential-1",
    mode: "preview_without_assertion_signature_verification",
  });
});
