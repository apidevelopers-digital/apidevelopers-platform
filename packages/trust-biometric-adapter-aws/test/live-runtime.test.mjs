import assert from "node:assert/strict";
import test from "node:test";
import { createAwsRekognitionLiveRuntime } from "../src/live-runtime.mjs";

class CreateCommand { constructor(input) { this.input = input; this.kind = "create"; } }
class GetResultCommand { constructor(input) { this.input = input; this.kind = "get"; } }
class CompareCommand { constructor(input) { this.input = input; this.kind = "compare"; } }

const commands = {
  CreateFaceLivenessSessionCommand: CreateCommand,
  GetFaceLivenessSessionResultsCommand: GetResultCommand,
  CompareFacesCommand: CompareCommand,
};

const enabledEnv = {
  TRUST_AWS_LIVE_CALLS_ENABLED: "true",
  TRUST_AWS_CREDENTIALS_ALLOWED: "true",
  TRUST_AWS_SANDBOX_APPROVAL: "IGOR_APROVA_TRUST_AWS_SANDBOX_REAL",
  AWS_REGION: "sa-east-1",
};

test("fails closed before calling AWS when live gates are disabled", async () => {
  let calls = 0;
  const client = { send: async () => { calls += 1; } };
  const runtime = createAwsRekognitionLiveRuntime({ client, commands, env: {} });

  await assert.rejects(
    runtime.createLivenessSession({
      clientRequestToken: "token-1",
      outputConfig: { S3Bucket: "bucket", S3KeyPrefix: "prefix" },
    }),
    (error) => error.code === "live_calls_disabled",
  );
  assert.equal(calls, 0);
});

test("creates liveness session with AuditImagesLimit 0 and S3 output only", async () => {
  let captured;
  const client = {
    send: async (command) => {
      captured = command;
      return { SessionId: "12345678-1bcd-4abc-8def-123456789abc" };
    },
  };
  const runtime = createAwsRekognitionLiveRuntime({ client, commands, env: enabledEnv });
  const result = await runtime.createLivenessSession({
    clientRequestToken: "token-1",
    outputConfig: { S3Bucket: "trust-sandbox", S3KeyPrefix: "face-lab/session-1" },
  });

  assert.equal(captured.kind, "create");
  assert.equal(captured.input.Settings.AuditImagesLimit, 0);
  assert.deepEqual(captured.input.Settings.OutputConfig, {
    S3Bucket: "trust-sandbox",
    S3KeyPrefix: "face-lab/session-1",
  });
  assert.equal(result.region, "sa-east-1");
});

test("get result keeps only S3 reference and rejects audit images", async () => {
  const client = {
    send: async () => ({
      SessionId: "12345678-1bcd-4abc-8def-123456789abc",
      Status: "SUCCEEDED",
      Confidence: 97.5,
      ReferenceImage: {
        S3Object: { Bucket: "trust-sandbox", Name: "ref/image.jpg" },
      },
      AuditImages: [],
    }),
  };
  const runtime = createAwsRekognitionLiveRuntime({ client, commands, env: enabledEnv });
  const result = await runtime.getLivenessResult({
    sessionId: "12345678-1bcd-4abc-8def-123456789abc",
  });

  assert.equal(result.Confidence, 97.5);
  assert.deepEqual(result.ReferenceImage, {
    S3Object: { Bucket: "trust-sandbox", Name: "ref/image.jpg" },
  });
  assert.deepEqual(result.AuditImages, []);
});

test("compare faces uses S3 references and returns only top similarity signal", async () => {
  let captured;
  const client = {
    send: async (command) => {
      captured = command;
      return { FaceMatches: [{ Similarity: 92.4 }, { Similarity: 88.1 }] };
    },
  };
  const runtime = createAwsRekognitionLiveRuntime({ client, commands, env: enabledEnv });
  const result = await runtime.compareFaces({
    sourceS3Object: { Bucket: "trust-sandbox", Name: "authorized/reference.jpg" },
    targetS3Object: { Bucket: "trust-sandbox", Name: "liveness/reference.jpg" },
  });

  assert.equal(captured.kind, "compare");
  assert.equal(captured.input.SimilarityThreshold, 0);
  assert.equal(captured.input.QualityFilter, "NONE");
  assert.equal(result.Similarity, 92.4);
  assert.equal(result.MatchCount, 2);
});
