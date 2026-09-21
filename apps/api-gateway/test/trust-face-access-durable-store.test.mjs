import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  TrustFaceAccessDurableStoreError,
  createFileTrustFaceAccessDurableStore,
  createInMemoryTrustFaceAccessDurableStore,
} from "../src/trust-face-access-durable-store.mjs";

test("durable store persists and consumes challenges once", async () => {
  const store = createInMemoryTrustFaceAccessDurableStore({
    now: () => "2026-09-20T23:55:00.000Z",
  });

  await store.saveChallenge({
    challenge: "challenge-1",
    type: "registration",
    userId: "igor",
    expiresAt: "2026-09-21T00:00:00.000Z",
  });

  const consumed = await store.consumeChallenge({
    challenge: "challenge-1",
    type: "registration",
    userId: "igor",
  });

  assert.equal(consumed.challenge, "challenge-1");
  assert.equal(consumed.type, "registration");
  assert.equal(consumed.userId, "igor");

  await assert.rejects(
    () =>
      store.consumeChallenge({
        challenge: "challenge-1",
        type: "registration",
        userId: "igor",
      }),
    /challenge_not_found/u,
  );
});

test("durable store prunes expired challenges", async () => {
  const store = createInMemoryTrustFaceAccessDurableStore({
    now: () => "2026-09-21T00:00:00.000Z",
    initialData: {
      challenges: [
        {
          challenge: "expired",
          type: "authentication",
          userId: "igor",
          expiresAt: "2026-09-20T23:59:59.000Z",
        },
      ],
      credentials: [],
    },
  });

  await assert.rejects(
    () =>
      store.consumeChallenge({
        challenge: "expired",
        type: "authentication",
        userId: "igor",
      }),
    /challenge_not_found/u,
  );
});

test("durable store saves descriptors and hides revoked credentials", async () => {
  const store = createInMemoryTrustFaceAccessDurableStore({
    now: () => "2026-09-20T23:55:00.000Z",
  });

  await store.saveCredential({
    userId: "igor",
    credentialId: "credential-1",
    userName: "igor@apidevelopers.digital",
    displayName: "Igor",
    transports: ["internal"],
    publicKey: "public-key",
    signCount: 0,
  });

  assert.deepEqual(await store.listCredentialDescriptors("igor"), [
    {
      type: "public-key",
      id: "credential-1",
      transports: ["internal"],
    },
  ]);

  const credential = await store.getCredential({
    userId: "igor",
    credentialId: "credential-1",
  });

  assert.equal(credential.userName, "igor@apidevelopers.digital");
  assert.equal(credential.publicKey, "public-key");
  assert.equal(credential.status, "active");

  assert.equal(
    await store.revokeCredential({
      userId: "igor",
      credentialId: "credential-1",
      revokedAt: "2026-09-20T23:56:00.000Z",
    }),
    true,
  );

  assert.deepEqual(await store.listCredentialDescriptors("igor"), []);
  assert.equal(
    await store.getCredential({
      userId: "igor",
      credentialId: "credential-1",
    }),
    null,
  );
});

test("file durable store writes JSON data that can be reopened", async () => {
  const dir = await mkdtemp(join(tmpdir(), "trust-face-access-"));
  const path = join(dir, "store.json");

  const firstStore = createFileTrustFaceAccessDurableStore({
    path,
    now: () => "2026-09-20T23:55:00.000Z",
  });

  await firstStore.saveCredential({
    userId: "igor",
    credentialId: "credential-1",
    transports: ["internal"],
  });

  const secondStore = createFileTrustFaceAccessDurableStore({ path });
  assert.deepEqual(await secondStore.listCredentialDescriptors("igor"), [
    {
      type: "public-key",
      id: "credential-1",
      transports: ["internal"],
    },
  ]);

  const raw = JSON.parse(await readFile(path, "utf8"));
  assert.equal(raw.version, 1);
  assert.equal(raw.credentials[0].credentialId, "credential-1");
});

test("file durable store reports invalid JSON safely", async () => {
  const dir = await mkdtemp(join(tmpdir(), "trust-face-access-invalid-"));
  const path = join(dir, "store.json");
  await import("node:fs/promises").then(({ writeFile }) => writeFile(path, "{", "utf8"));

  const store = createFileTrustFaceAccessDurableStore({ path });

  await assert.rejects(
    () => store.listCredentialDescriptors("igor"),
    (error) =>
      error instanceof TrustFaceAccessDurableStoreError &&
      error.code === "invalid_store_json",
  );
});
