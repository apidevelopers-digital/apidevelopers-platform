import assert from "node:assert/strict";
import test from "node:test";

import { createTrustFaceAccessHttpRoutes } from "../src/trust-face-access-http-routes.mjs";
import { createTrustFaceAccessService } from "../src/trust-face-access-passkeys.mjs";

test("registerVerify forwards preview registration verification payloads", () => {
  const service = createTrustFaceAccessService();
  const routes = createTrustFaceAccessHttpRoutes({ trustFaceAccess: service });
  const options = service.createRegistrationOptions({
    userId: "igor",
    userName: "igor@apidevelopers.digital",
  });

  const response = routes.registerVerify({
    userId: "igor",
    challenge: options.publicKey.challenge,
    credentialId: "credential-1",
    transports: ["internal"],
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.payload, {
    registered: true,
    credentialId: "credential-1",
    mode: "preview_without_attestation_verification",
  });
});

test("authenticateVerify forwards preview authentication verification payloads", () => {
  const service = createTrustFaceAccessService();
  const routes = createTrustFaceAccessHttpRoutes({ trustFaceAccess: service });

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
  const response = routes.authenticateVerify({
    userId: "igor",
    challenge: authentication.publicKey.challenge,
    credentialId: "credential-1",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.payload, {
    authenticated: true,
    userId: "igor",
    credentialId: "credential-1",
    mode: "preview_without_assertion_signature_verification",
  });
});

test("verify routes report unavailable services without throwing", () => {
  const routes = createTrustFaceAccessHttpRoutes();

  assert.deepEqual(routes.registerVerify({}), {
    status: 503,
    payload: {
      error: "trust_face_access_unavailable",
    },
  });
  assert.deepEqual(routes.authenticateVerify({}), {
    status: 503,
    payload: {
      error: "trust_face_access_unavailable",
    },
  });
});

test("verify routes reject non-object payloads", () => {
  const service = createTrustFaceAccessService();
  const routes = createTrustFaceAccessHttpRoutes({ trustFaceAccess: service });

  assert.throws(() => routes.registerVerify(null), /json_object_payload_required/u);
  assert.throws(() => routes.authenticateVerify([]), /json_object_payload_required/u);
});
