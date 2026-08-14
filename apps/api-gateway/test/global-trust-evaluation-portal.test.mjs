import assert from "node:assert/strict";
import { constants, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createJsonFileStore } from "@apidevelopers/persistence-core";
import { createTrustEvaluationCredentialEnvelopeHandoff } from "../src/global-trust-evaluation-credential-envelope.mjs";
import { createGlobalTrustEvaluationPortalInbox } from "../src/global-trust-evaluation-portal-inbox.mjs";
import {
  createGlobalTrustEvaluationPortalSessionService,
  trustEvaluationEnrollmentIdFor,
} from "../src/global-trust-evaluation-portal-session.mjs";
import { createTrustEvaluationRecipientKeyProofService } from "../src/global-trust-evaluation-recipient-key-proof.mjs";

const ORG = "component.organization.portal-acme";
const NOW = "2026-08-14T14:00:00.000Z";
const ENROLLMENTS = "trust.evaluation.recipient_key_enrollments";

function rsaPair() {
  return generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

function signatureFor(challenge, privateKey) {
  return sign(
    "sha256",
    Buffer.from(challenge.signingPayloadB64u, "base64url"),
    {
      key: privateKey,
      padding: constants.RSA_PKCS1_PSS_PADDING,
      saltLength: 32,
    },
  ).toString("base64url");
}

async function fixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "trust-portal-"));
  const filePath = path.join(dir, "state.json");
  let now = NOW;
  let writeCounter = 0;
  const store = createJsonFileStore({
    filePath,
    clock: () => now,
    idFactory: () => `write-${++writeCounter}`,
  });
  const pair = rsaPair();
  const enrollmentId = trustEvaluationEnrollmentIdFor(ORG);
  const publicKey = await import("node:crypto").then(({ createPublicKey, createHash }) => {
    const key = createPublicKey(pair.publicKey);
    return {
      fingerprint: createHash("sha256")
        .update(key.export({ type: "spki", format: "der" }))
        .digest("base64url"),
    };
  });

  await store.transaction((tx) => {
    tx.put(
      ENROLLMENTS,
      enrollmentId,
      Object.freeze({
        enrollmentId,
        version: "trust-evaluation-recipient-key-enrollment/v1",
        status: "approved",
        organizationId: ORG,
        recipientKeyFingerprint: publicKey.fingerprint,
        recipientPublicKeySpkiPem: pair.publicKey,
        keyPossessionVerified: true,
        identityVerification: Object.freeze({
          performedByThisService: false,
          source: "external_institutional_decision",
        }),
      }),
      { ifAbsent: true },
    );
    return true;
  });

  const proof = createTrustEvaluationRecipientKeyProofService({
    store,
    clock: () => now,
  });
  const sessions = createGlobalTrustEvaluationPortalSessionService({
    store,
    recipientKeyProofService: proof,
    clock: () => now,
    sessionTtlMs: 300_000,
  });
  const inbox = createGlobalTrustEvaluationPortalInbox({
    store,
    clock: () => now,
  });

  return {
    dir,
    filePath,
    store,
    pair,
    enrollmentId,
    sessions,
    inbox,
    setNow(value) {
      now = value;
    },
  };
}

async function login(fx) {
  const challenge = await fx.sessions.begin({
    organizationId: ORG,
    correlationId: "corr-portal-login-001",
  });
  const completed = await fx.sessions.complete({
    organizationId: ORG,
    challengeId: challenge.challengeId,
    signatureB64u: signatureFor(challenge, fx.pair.privateKey),
  });
  const session = await fx.sessions.authenticate({ token: completed.token });
  return { challenge, completed, session };
}

async function realEnvelope(pair) {
  let captured = null;
  const handoff = createTrustEvaluationCredentialEnvelopeHandoff({
    recipientPublicKey: pair.publicKey,
    async deliverEnvelope(envelope) {
      captured = structuredClone(envelope);
    },
  });
  await handoff.deliver({
    secret: "trust_eval_portal_secret_abcdefghijklmnopqrstuvwxyz012345",
    tenantId: "tenant-portal-acme",
    apiKeyId: "apikey-portal-acme",
    expiresAt: "2026-08-28T14:00:00.000Z",
    correlationId: "corr-portal-envelope-001",
  });
  assert.ok(captured);
  return captured;
}

test("portal session requires approved key possession, stores only token digest and blocks replay/revocation", async (t) => {
  const fx = await fixture();
  t.after(() => rm(fx.dir, { recursive: true, force: true }));

  const challenge = await fx.sessions.begin({
    organizationId: ORG,
    correlationId: "corr-portal-session-001",
  });
  const signatureB64u = signatureFor(challenge, fx.pair.privateKey);
  const completed = await fx.sessions.complete({
    organizationId: ORG,
    challengeId: challenge.challengeId,
    signatureB64u,
  });

  assert.match(completed.token, /^trust_session_/);
  const session = await fx.sessions.authenticate({ token: completed.token });
  assert.equal(session.role, "evaluation_portal");
  assert.equal(session.principal.organizationId, ORG);
  assert.equal(session.principal.enrollmentId, fx.enrollmentId);
  assert.deepEqual(session.principal.scopes, ["trust:evaluation:portal"]);

  await assert.rejects(
    fx.sessions.complete({
      organizationId: ORG,
      challengeId: challenge.challengeId,
      signatureB64u,
    }),
    (error) => error.code === "TRUST_EVALUATION_KEY_PROOF_REPLAY",
  );

  const persisted = await readFile(fx.filePath, "utf8");
  assert.equal(persisted.includes(completed.token), false);
  assert.equal(persisted.includes(fx.pair.privateKey), false);
  assert.match(persisted, /tokenDigest/);

  const revoked = await fx.sessions.revoke({ token: completed.token });
  assert.equal(revoked.revoked, true);
  await assert.rejects(
    fx.sessions.authenticate({ token: completed.token }),
    (error) => error.code === "TRUST_EVALUATION_PORTAL_SESSION_UNAUTHORIZED",
  );
});

test("portal session expires and does not authenticate against missing enrollment", async (t) => {
  const fx = await fixture();
  t.after(() => rm(fx.dir, { recursive: true, force: true }));

  const { completed } = await login(fx);
  fx.setNow("2026-08-14T14:05:00.000Z");
  await assert.rejects(
    fx.sessions.authenticate({ token: completed.token }),
    (error) => error.code === "TRUST_EVALUATION_PORTAL_SESSION_UNAUTHORIZED",
  );

  await assert.rejects(
    fx.sessions.begin({
      organizationId: "component.organization.unknown",
      correlationId: "corr-portal-unknown",
    }),
    (error) => error.code === "TRUST_EVALUATION_PORTAL_SESSION_ENROLLMENT_REQUIRED",
  );
});

test("portal inbox persists only ciphertext, isolates organizations and supports authenticated acknowledge", async (t) => {
  const fx = await fixture();
  t.after(() => rm(fx.dir, { recursive: true, force: true }));

  const { session } = await login(fx);
  const envelope = await realEnvelope(fx.pair);
  const delivery = await fx.inbox.deliver({
    organizationId: ORG,
    enrollmentId: fx.enrollmentId,
    envelope,
  });

  assert.equal(delivery.accepted, true);
  assert.equal(delivery.created, true);
  assert.equal(delivery.externalDeliveryOccurred, false);
  assert.equal(delivery.plaintextCredentialIncluded, false);
  assert.match(delivery.transportReference, /^portal-inbox:/);

  const list = await fx.inbox.list({ session });
  assert.equal(list.length, 1);
  assert.equal(list[0].messageId, delivery.messageId);
  assert.equal("envelope" in list[0], false);

  const message = await fx.inbox.get({ session, messageId: delivery.messageId });
  assert.deepEqual(message.envelope, envelope);
  assert.equal(JSON.stringify(message.envelope).includes("trust_eval_portal_secret_"), false);

  const opened = await fx.inbox.acknowledge({ session, messageId: delivery.messageId });
  assert.equal(opened.status, "opened");
  assert.equal(opened.openedAt, NOW);

  const duplicate = await fx.inbox.deliver({
    organizationId: ORG,
    enrollmentId: fx.enrollmentId,
    envelope,
  });
  assert.equal(duplicate.created, false);

  const foreign = Object.freeze({
    role: "evaluation_portal",
    principal: Object.freeze({
      id: "foreign-session",
      organizationId: "component.organization.other",
      enrollmentId: "other-enrollment",
      scopes: Object.freeze(["trust:evaluation:portal"]),
      status: "active",
    }),
  });
  await assert.rejects(
    fx.inbox.get({ session: foreign, messageId: delivery.messageId }),
    (error) => error.code === "TRUST_EVALUATION_PORTAL_INBOX_NOT_FOUND",
  );

  const persisted = await readFile(fx.filePath, "utf8");
  assert.equal(persisted.includes("trust_eval_portal_secret_"), false);
  assert.equal(persisted.includes(fx.pair.privateKey), false);
  assert.equal(persisted.includes(envelope.ciphertextB64u), true);
});
