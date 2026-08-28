import assert from "node:assert/strict";
import test from "node:test";
import { createGlobalTrustFaceLabLiveProvider } from "../src/global-trust-face-lab-live-provider.mjs";

const LIVE_ENV = Object.freeze({
  TRUST_AWS_LIVE_CALLS_ENABLED: "true",
  TRUST_AWS_CREDENTIALS_ALLOWED: "true",
  TRUST_AWS_SANDBOX_APPROVAL: "IGOR_APROVA_TRUST_AWS_SANDBOX_REAL",
  TRUST_AWS_S3_BUCKET: "trust-sandbox",
  TRUST_AWS_S3_PREFIX: "trust-face-lab/sandbox",
  AWS_REGION: "sa-east-1",
});

class CreateFaceLivenessSessionCommand { constructor(input){ this.input=input; } }
class GetFaceLivenessSessionResultsCommand { constructor(input){ this.input=input; } }
class CompareFacesCommand { constructor(input){ this.input=input; } }

const rekognitionCommands = {
  CreateFaceLivenessSessionCommand,
  GetFaceLivenessSessionResultsCommand,
  CompareFacesCommand,
};

test("provider factory stays null without explicit live gates", () => {
  assert.equal(createGlobalTrustFaceLabLiveProvider({ env: {} }), null);
});

test("provider factory stays null without injected AWS client and commands", () => {
  assert.equal(createGlobalTrustFaceLabLiveProvider({ env: LIVE_ENV }), null);
});

test("provider factory preserves Rekognition runtime when S3 primitives are not injected", () => {
  const runtime = createGlobalTrustFaceLabLiveProvider({
    env: LIVE_ENV,
    client: { async send() { throw new Error("network must not run in factory test"); } },
    commands: rekognitionCommands,
  });

  assert.equal(typeof runtime.createLivenessSession, "function");
  assert.equal(typeof runtime.getLivenessResult, "function");
  assert.equal(typeof runtime.compareFaces, "function");
  assert.equal(Object.hasOwn(runtime, "compareEphemeralReference"), false);
});

test("provider wires ephemeral S3 PutObject -> CompareFaces -> DeleteObject", async () => {
  const calls = [];

  class PutObjectCommand { constructor(input){ this.input=input; } }
  class DeleteObjectCommand { constructor(input){ this.input=input; } }

  const client = {
    async send(command) {
      calls.push({ kind: "rekognition", command });
      if (command instanceof CompareFacesCommand) {
        return {
          FaceMatches: [{ Similarity: 97.5 }],
          UnmatchedFaces: [],
        };
      }
      throw new Error("unexpected Rekognition command");
    },
  };

  const s3Client = {
    async send(command) {
      calls.push({ kind: "s3", command });
      return {};
    },
  };

  const runtime = createGlobalTrustFaceLabLiveProvider({
    env: LIVE_ENV,
    client,
    commands: rekognitionCommands,
    s3Client,
    s3Commands: { PutObjectCommand, DeleteObjectCommand },
  });

  const result = await runtime.compareEphemeralReference({
    referenceKey: "trust-face-lab/sandbox/reference/ref-1.jpg",
    referenceBytes: Buffer.from("reference"),
    targetS3Object: {
      Bucket: "trust-sandbox",
      Name: "trust-face-lab/sandbox/liveness/session-1/reference.jpg",
    },
    similarityThreshold: 90,
  });

  assert.equal(calls.length, 3);
  assert.ok(calls[0].command instanceof PutObjectCommand);
  assert.ok(calls[1].command instanceof CompareFacesCommand);
  assert.ok(calls[2].command instanceof DeleteObjectCommand);
  assert.equal(calls[0].command.input.Bucket, "trust-sandbox");
  assert.equal(calls[0].command.input.Key, "trust-face-lab/sandbox/reference/ref-1.jpg");
  assert.equal(calls[1].command.input.SourceImage.S3Object.Name, "trust-face-lab/sandbox/reference/ref-1.jpg");
  assert.equal(calls[1].command.input.TargetImage.S3Object.Name, "trust-face-lab/sandbox/liveness/session-1/reference.jpg");
  assert.equal(calls[2].command.input.Key, "trust-face-lab/sandbox/reference/ref-1.jpg");
  assert.equal(result.deleted, true);
  assert.equal(result.comparison.Similarity, 97.5);
});

test("provider rejects reference outside configured boundary before S3 upload", async () => {
  let sends = 0;
  class PutObjectCommand { constructor(input){ this.input=input; } }
  class DeleteObjectCommand { constructor(input){ this.input=input; } }

  const runtime = createGlobalTrustFaceLabLiveProvider({
    env: LIVE_ENV,
    client: { async send() { sends += 1; return {}; } },
    commands: rekognitionCommands,
    s3Client: { async send() { sends += 1; return {}; } },
    s3Commands: { PutObjectCommand, DeleteObjectCommand },
  });

  await assert.rejects(
    runtime.compareEphemeralReference({
      referenceKey: "outside/reference.jpg",
      referenceBytes: Buffer.from("reference"),
      targetS3Object: {
        Bucket: "trust-sandbox",
        Name: "trust-face-lab/sandbox/liveness/session-1/reference.jpg",
      },
    }),
    (error) => error?.code === "TRUST_FACE_LAB_S3_PREFIX_OUTSIDE_BOUNDARY",
  );
  assert.equal(sends, 0);
});
