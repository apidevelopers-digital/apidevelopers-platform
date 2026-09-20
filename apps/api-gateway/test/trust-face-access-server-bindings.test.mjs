import assert from "node:assert/strict";
import test from "node:test";

import { createTrustFaceAccessServerBindings } from "../src/trust-face-access-server-bindings.mjs";
import { createTrustFaceAccessService } from "../src/trust-face-access-passkeys.mjs";

function parseJsonBody(body) {
  return body === undefined || String(body).trim() === "" ? {} : JSON.parse(body);
}

test("Trust Face Access server bindings ignore unrelated routes", () => {
  const bindings = createTrustFaceAccessServerBindings({
    trustFaceAccess: createTrustFaceAccessService(),
    parseJsonBody,
  });

  assert.equal(
    bindings.handle({
      method: "GET",
      pathname: "/v1/trust/face-access/status",
    }),
    null,
  );
});

test("Trust Face Access server bindings route register verify", () => {
  const service = createTrustFaceAccessService();
  const bindings = createTrustFaceAccessServerBindings({
    trustFaceAccess: service,
    parseJsonBody,
  });

  const options = service.createRegistrationOptions({
    userId: "igor",
    userName: "igor@apidevelopers.digital",
  });

  const result = bindings.handle({
    method: "POST",
    pathname: "/v1/trust/face-access/register/verify",
    body: JSON.stringify({
      userId: "igor",
      challenge: options.publicKey.challenge,
      credentialId: "credential-1",
      transports: ["internal"],
    }),
  });

  assert.deepEqual(result, {
    status: 200,
    payload: {
      registered: true,
      credentialId: "credential-1",
      mode: "preview_without_attestation_verification",
    },
  });
});

test("Trust Face Access server bindings route authenticate verify", () => {
  const service = createTrustFaceAccessService();
  const bindings = createTrustFaceAccessServerBindings({
    trustFaceAccess: service,
    parseJsonBody,
  });

  const registration = service.createRegistrationOptions({
    userId: "igor",
    userName: "igor@apidevelopers.digital",
  });

  service.verifyRegistrationPreview({
    userId: "igor",
    challenge: registration.publicKey.challenge,
    credentialId: "credential-1",
  });

  const authentication = service.createAuthenticationOptions({ userId: "igor" });
  const result = bindings.handle({
    method: "POST",
    pathname: "/v1/trust/face-access/authenticate/verify",
    body: JSON.stringify({
      userId: "igor",
      challenge: authentication.publicKey.challenge,
      credentialId: "credential-1",
    }),
  });

  assert.deepEqual(result, {
    status: 200,
    payload: {
      authenticated: true,
      userId: "igor",
      credentialId: "credential-1",
      mode: "preview_without_assertion_signature_verification",
    },
  });
});

test("Trust Face Access server bindings require explicit JSON parser", () => {
  assert.throws(
    () => createTrustFaceAccessServerBindings(),
    /parseJsonBody must be a function/u,
  );
});
