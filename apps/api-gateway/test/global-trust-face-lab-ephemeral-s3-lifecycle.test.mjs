import assert from "node:assert/strict";
import test from "node:test";
import { createGlobalTrustFaceLabEphemeralS3Lifecycle } from "../src/global-trust-face-lab-ephemeral-s3-lifecycle.mjs";

class PutObjectCommand {
  constructor(input) { this.input = input; }
}

class DeleteObjectCommand {
  constructor(input) { this.input = input; }
}

test("ephemeral lifecycle uploads, compares, and deletes the reference", async () => {
  const calls = [];
  const lifecycle = createGlobalTrustFaceLabEphemeralS3Lifecycle({
    s3Client: {
      async send(command) {
        calls.push(command);
        return {};
      },
    },
    PutObjectCommand,
    DeleteObjectCommand,
    async compareFaces(input) {
      calls.push({ compare: input });
      return { matched: true, similarity: 99.1 };
    },
  });

  const result = await lifecycle.compareEphemeralReference({
    bucket: "trust-sandbox",
    key: "trust-face-lab/sandbox/reference.jpg",
    body: Buffer.from("reference"),
    target: {
      bucket: "trust-sandbox",
      key: "trust-face-lab/sandbox/liveness-output.jpg",
    },
    similarityThreshold: 90,
  });

  assert.equal(calls.length, 3);
  assert.ok(calls[0] instanceof PutObjectCommand);
  assert.deepEqual(calls[0].input, {
    Bucket: "trust-sandbox",
    Key: "trust-face-lab/sandbox/reference.jpg",
    Body: Buffer.from("reference"),
    ContentType: "image/jpeg",
  });
  assert.deepEqual(calls[1], {
    compare: {
      source: {
        bucket: "trust-sandbox",
        key: "trust-face-lab/sandbox/reference.jpg",
      },
      target: {
        bucket: "trust-sandbox",
        key: "trust-face-lab/sandbox/liveness-output.jpg",
      },
      similarityThreshold: 90,
    },
  });
  assert.ok(calls[2] instanceof DeleteObjectCommand);
  assert.deepEqual(calls[2].input, {
    Bucket: "trust-sandbox",
    Key: "trust-face-lab/sandbox/reference.jpg",
  });
  assert.equal(result.deleted, true);
  assert.equal(result.comparison.matched, true);
});

test("ephemeral lifecycle deletes the reference when compareFaces fails", async () => {
  const calls = [];
  const compareError = new Error("compare failed");
  const lifecycle = createGlobalTrustFaceLabEphemeralS3Lifecycle({
    s3Client: {
      async send(command) {
        calls.push(command);
        return {};
      },
    },
    PutObjectCommand,
    DeleteObjectCommand,
    async compareFaces() {
      throw compareError;
    },
  });

  await assert.rejects(
    lifecycle.compareEphemeralReference({
      bucket: "trust-sandbox",
      key: "trust-face-lab/sandbox/reference.jpg",
      body: Buffer.from("reference"),
      target: {
        bucket: "trust-sandbox",
        key: "trust-face-lab/sandbox/liveness-output.jpg",
      },
    }),
    (error) => error === compareError,
  );

  assert.equal(calls.length, 2);
  assert.ok(calls[0] instanceof PutObjectCommand);
  assert.ok(calls[1] instanceof DeleteObjectCommand);
});

test("ephemeral lifecycle surfaces both compare and cleanup failures", async () => {
  const compareError = new Error("compare failed");
  const cleanupError = new Error("cleanup failed");
  let sends = 0;

  const lifecycle = createGlobalTrustFaceLabEphemeralS3Lifecycle({
    s3Client: {
      async send(command) {
        sends += 1;
        if (command instanceof DeleteObjectCommand) {
          throw cleanupError;
        }
        return {};
      },
    },
    PutObjectCommand,
    DeleteObjectCommand,
    async compareFaces() {
      throw compareError;
    },
  });

  await assert.rejects(
    lifecycle.compareEphemeralReference({
      bucket: "trust-sandbox",
      key: "trust-face-lab/sandbox/reference.jpg",
      body: Buffer.from("reference"),
      target: {
        bucket: "trust-sandbox",
        key: "trust-face-lab/sandbox/liveness-output.jpg",
      },
    }),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.errors[0], compareError);
      assert.equal(error.errors[1], cleanupError);
      return true;
    },
  );

  assert.equal(sends, 2);
});
