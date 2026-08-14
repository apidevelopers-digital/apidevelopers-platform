import assert from "node:assert/strict";
import { constants, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createCanonicalId } from "@apidevelopers/contracts";
import { openTrustEvaluationCredentialEnvelope } from "../src/global-trust-evaluation-credential-envelope.mjs";
import { createOperationalTrustEvaluationPortalGateway } from "../src/operational-trust-evaluation-portal-composition.mjs";

const NOW = "2026-08-14T15:10:00.000Z";
const SECRET = "trust_eval_portal_in_product_0123456789abcdefghijklmnopqrstuvwxyz";
const ORG = createCanonicalId({ family: "component", segments: ["organization", "portal-in-product"] });

const admin = () => Object.freeze({
  role: "admin",
  principal: Object.freeze({ id: "platform-admin", name: "Platform Administrator", status: "active", scopes: Object.freeze(["admin:*"]) }),
});
const approval = () => Object.freeze({
  decision: "approved",
  assertion: "organization_and_recipient_authorized",
  reference: "institutional-decision:trust-evaluation:portal:001",
  authority: "API Developers.digital",
  approvedBy: "institutional-approver-1",
  approvedAt: "2026-08-14T15:09:00.000Z",
  subjectOrganizationId: ORG,
});
const pair = () => generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const sig = (challenge, privateKey) => sign(
  "sha256",
  Buffer.from(challenge.signingPayloadB64u, "base64url"),
  { key: privateKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 },
).toString("base64url");

async function gatewayFixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "trust-portal-e2e-"));
  const stateFilePath = path.join(dir, "state.json");
  let writes = 0;
  const gateway = createOperationalTrustEvaluationPortalGateway({
    stateFilePath,
    clock: () => NOW,
    writeIdFactory: () => `write-${++writes}`,
    apiKeyIdFactory: () => "apikey-portal-in-product",
    generateKey: () => SECRET,
    assertTenantOperational: async () => true,
  });
  return { dir, gateway };
}

async function enroll(gateway, keys) {
  const challenge = await gateway.evaluationRecipientKeyProof.issueChallenge({
    organizationId: ORG,
    recipientPublicKey: keys.publicKey,
    correlationId: "corr-enroll",
  });
  await gateway.evaluationRecipientKeyProof.verifyAndConsume({
    challengeId: challenge.challengeId,
    recipientPublicKey: keys.publicKey,
    signatureB64u: sig(challenge, keys.privateKey),
  });
  return gateway.evaluationRecipientKeyEnrollment.recordApprovedEnrollment({
    identity: admin(),
    organizationId: ORG,
    recipientPublicKey: keys.publicKey,
    keyProofChallengeId: challenge.challengeId,
    institutionalApproval: approval(),
  });
}

async function login(gateway, keys) {
  const challenge = await gateway.evaluationPortalSession.begin({
    organizationId: ORG,
    correlationId: "corr-login",
  });
  const completed = await gateway.evaluationPortalSession.complete({
    organizationId: ORG,
    challengeId: challenge.challengeId,
    signatureB64u: sig(challenge, keys.privateKey),
  });
  return {
    completed,
    session: await gateway.evaluationPortalSession.authenticate({ token: completed.token }),
  };
}

test("approved onboarding lands only in authenticated in-product portal inbox", async (t) => {
  const fx = await gatewayFixture();
  t.after(() => rm(fx.dir, { recursive: true, force: true }));
  const keys = pair();
  const enrollment = await enroll(fx.gateway, keys);

  const provisioned = await fx.gateway.evaluationApprovedOnboarding.provisionApprovedEvaluation({
    identity: admin(),
    organizationId: ORG,
    slug: "portal-in-product",
    displayName: "Portal In Product Evaluation",
    correlationId: "corr-provision",
  });
  assert.equal(provisioned.created, true);
  assert.equal(provisioned.secretDelivered, true);
  assert.equal(provisioned.enrollmentId, enrollment.enrollmentId);
  assert.equal(fx.gateway.evaluationDeliveryChannel, "in_product_portal");
  assert.equal(fx.gateway.evaluationExternalEnvelopeEgress, false);
  assert.equal(JSON.stringify(provisioned).includes(SECRET), false);

  const { completed, session } = await login(fx.gateway, keys);
  const list = await fx.gateway.evaluationPortalInbox.list({ session });
  assert.equal(list.length, 1);
  assert.equal("envelope" in list[0], false);

  const message = await fx.gateway.evaluationPortalInbox.get({
    session,
    messageId: list[0].messageId,
  });
  const recovered = openTrustEvaluationCredentialEnvelope({
    envelope: message.envelope,
    recipientPrivateKey: keys.privateKey,
  });
  assert.equal(recovered, SECRET);

  const response = await fx.gateway.app.handleRequest({
    method: "GET",
    url: "/v1/trust/evaluation",
    headers: { "x-tenant-id": provisioned.tenantId, "x-api-key": recovered },
  });
  assert.equal(response.status, 200);
  assert.equal(JSON.parse(response.body).allowed, true);

  await fx.gateway.evaluationPortalSession.revoke({ token: completed.token });
  await assert.rejects(
    fx.gateway.evaluationPortalSession.authenticate({ token: completed.token }),
    (error) => error.code === "TRUST_EVALUATION_PORTAL_SESSION_UNAUTHORIZED",
  );
});

test("portal composition rejects competing credential delivery sinks", () => {
  assert.throws(
    () => createOperationalTrustEvaluationPortalGateway({ deliverEvaluationEnvelope: async () => {} }),
    /portal gateway owns Evaluation credential delivery/,
  );
  assert.throws(
    () => createOperationalTrustEvaluationPortalGateway({ credentialHandoff: {} }),
    /portal gateway owns Evaluation credential delivery/,
  );
});
