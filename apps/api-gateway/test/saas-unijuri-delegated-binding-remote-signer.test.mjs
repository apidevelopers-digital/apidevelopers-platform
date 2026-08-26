import test from "node:test";
import assert from "node:assert/strict";
import { constants, generateKeyPairSync, sign as cryptoSign } from "node:crypto";

import {
  UNIJURI_DELEGATED_BINDING_ALGORITHM as ALGORITHM,
  UNIJURI_DELEGATED_BINDING_AUDIENCE as AUDIENCE,
  UNIJURI_DELEGATED_BINDING_VERSION as BINDING_VERSION,
} from "../src/saas-unijuri-delegated-binding-proof.mjs";
import {
  UNIJURI_REMOTE_SIGNER_VERSION,
  createUniJuriRemoteBindingSigner,
} from "../src/saas-unijuri-delegated-binding-remote-signer.mjs";
import { createUniJuriRemoteSignerService } from "../src/saas-unijuri-delegated-binding-remote-signer-service.mjs";

const clock = () => new Date("2026-08-26T18:00:00.000Z");

test("UniJuri remote signer round-trips and rejects replay", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const service = createUniJuriRemoteSignerService({
    keyId: "unijuri-binding-test-v1",
    clock,
    signPayload({ payloadB64u }) {
      return cryptoSign("sha256", Buffer.from(payloadB64u, "utf8"), {
        key: privateKey,
        padding: constants.RSA_PKCS1_PSS_PADDING,
        saltLength: 32,
      }).toString("base64url");
    },
  });
  let captured;
  const signer = createUniJuriRemoteBindingSigner({
    keyId: "unijuri-binding-test-v1",
    clock,
    nonceFactory: () => "nonce-1",
    transport: { async sign(request) { captured = request; return service.sign(request); } },
  });

  const proof = await signer.signBinding({
    tenantId: "component.tenant.acme",
    workspaceId: "component.workspace.acme.juri",
    accessGrantId: "component.access.acme.juri",
    productId: "uni-juri",
    principalId: "component.principal.user",
  });

  assert.equal(captured.version, UNIJURI_REMOTE_SIGNER_VERSION);
  assert.equal(captured.audience, AUDIENCE);
  assert.equal(proof.version, BINDING_VERSION);
  assert.equal(proof.algorithm, ALGORITHM);
  await assert.rejects(service.sign(captured), /remote_signer_replay_detected/);
});

test("UniJuri remote signer denies cross-product transport", async () => {
  let calls = 0;
  const signer = createUniJuriRemoteBindingSigner({
    keyId: "unijuri-binding-test-v1",
    transport: { async sign() { calls += 1; } },
  });
  assert.equal(await signer.signBinding({ productId: "zuni" }), null);
  assert.equal(calls, 0);
});
