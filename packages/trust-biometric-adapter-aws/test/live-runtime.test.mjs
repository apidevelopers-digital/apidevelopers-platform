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
const sessionId = "12345678-1bcd-4abc-8def-123456789abc";
const enabledEnv = {
  TRUST_AWS_LIVE_CALLS_ENABLED: "true",
  TRUST_AWS_CREDENTIALS_ALLOWED: "true",
  TRUST_AWS_SANDBOX_APPROVAL: "IGOR_APROVA_TRUST_AWS_SANDBOX_REAL",
  TRUST_AWS_S3_BUCKET: "trust-sandbox",
  TRUST_AWS_S3_PREFIX: "trust-face-lab/sandbox",
  AWS_REGION: "sa-east-1",
};
function runtimeWith(send, env = enabledEnv) {
  return createAwsRekognitionLiveRuntime({ client: { send }, commands, env });
}

test("fails closed before calling AWS when live gates are disabled", async () => {
  let calls = 0;
  const runtime = runtimeWith(async () => { calls += 1; }, {});
  await assert.rejects(
    runtime.createLivenessSession({
      clientRequestToken: "token-1",
      outputConfig: { S3Bucket: "trust-sandbox", S3KeyPrefix: "trust-face-lab/sandbox/session-1" },
    }),
    (error) => error.code === "live_calls_disabled",
  );
  assert.equal(calls, 0);
});

test("creates liveness session with AuditImagesLimit 0 inside configured S3 boundary", async () => {
  let captured;
  const runtime = runtimeWith(async (command) => {
    captured = command;
    return { SessionId: sessionId };
  });
  const result = await runtime.createLivenessSession({
    clientRequestToken: "token-1",
    outputConfig: { S3Bucket: "trust-sandbox", S3KeyPrefix: "trust-face-lab/sandbox/session-1" },
  });
  assert.equal(captured.kind, "create");
  assert.equal(captured.input.Settings.AuditImagesLimit, 0);
  assert.deepEqual(captured.input.Settings.OutputConfig, {
    S3Bucket: "trust-sandbox",
    S3KeyPrefix: "trust-face-lab/sandbox/session-1",
  });
  assert.equal(result.region, "sa-east-1");
});

test("rejects output outside configured S3 boundary before AWS call", async () => {
  let calls = 0;
  const runtime = runtimeWith(async () => { calls += 1; });
  await assert.rejects(
    runtime.createLivenessSession({
      clientRequestToken: "token-1",
      outputConfig: { S3Bucket: "other-bucket", S3KeyPrefix: "trust-face-lab/sandbox/session-1" },
    }),
    (error) => error.code === "s3_bucket_outside_boundary",
  );
  assert.equal(calls, 0);
});

test("get result keeps only S3 reference and validates session binding", async () => {
  const runtime = runtimeWith(async () => ({
    SessionId: sessionId,
    Status: "SUCCEEDED",
    Confidence: 97.5,
    ReferenceImage: {
      S3Object: { Bucket: "trust-sandbox", Name: "trust-face-lab/sandbox/liveness/reference.jpg" },
    },
    AuditImages: [],
  }));
  const result = await runtime.getLivenessResult({ sessionId });
  assert.equal(result.SessionId, sessionId);
  assert.equal(result.Status, "SUCCEEDED");
  assert.equal(result.Confidence, 97.5);
  assert.deepEqual(result.ReferenceImage, {
    S3Object: { Bucket: "trust-sandbox", Name: "trust-face-lab/sandbox/liveness/reference.jpg" },
  });
  assert.deepEqual(result.AuditImages, []);
});

test("get result rejects raw ReferenceImage bytes", async () => {
  const runtime = runtimeWith(async () => ({
    SessionId: sessionId,
    Status: "SUCCEEDED",
    Confidence: 97.5,
    ReferenceImage: {
      Bytes: new Uint8Array([1, 2, 3]),
      S3Object: { Bucket: "trust-sandbox", Name: "trust-face-lab/sandbox/liveness/reference.jpg" },
    },
    AuditImages: [],
  }));
  await assert.rejects(
    runtime.getLivenessResult({ sessionId }),
    (error) => error.code === "raw_biometric_material_forbidden",
  );
});

test("get result rejects succeeded session without S3 reference", async () => {
  const runtime = runtimeWith(async () => ({
    SessionId: sessionId,
    Status: "SUCCEEDED",
    Confidence: 97.5,
    ReferenceImage: null,
    AuditImages: [],
  }));
  await assert.rejects(
    runtime.getLivenessResult({ sessionId }),
    (error) => error.code === "reference_image_s3_required",
  );
});

test("get result rejects session mismatch and invalid confidence", async () => {
  const mismatch = runtimeWith(async () => ({
    SessionId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    Status: "SUCCEEDED",
    Confidence: 98,
    ReferenceImage: {
      S3Object: { Bucket: "trust-sandbox", Name: "trust-face-lab/sandbox/liveness/reference.jpg" },
    },
    AuditImages: [],
  }));
  await assert.rejects(
    mismatch.getLivenessResult({ sessionId }),
    (error) => error.code === "session_id_mismatch",
  );

  const invalid = runtimeWith(async () => ({
    SessionId: sessionId,
    Status: "SUCCEEDED",
    Confidence: 101,
    ReferenceImage: {
      S3Object: { Bucket: "trust-sandbox", Name: "trust-face-lab/sandbox/liveness/reference.jpg" },
    },
    AuditImages: [],
  }));
  await assert.rejects(
    invalid.getLivenessResult({ sessionId }),
    (error) => error.code === "invalid_liveness_confidence",
  );
});

test("compare faces returns one provider signal for one target face", async () => {
  let captured;
  const runtime = runtimeWith(async (command) => {
    captured = command;
    return { FaceMatches: [{ Similarity: 92.4 }], UnmatchedFaces: [] };
  });
  const result = await runtime.compareFaces({
    sourceS3Object: { Bucket: "trust-sandbox", Name: "trust-face-lab/sandbox/authorized/reference.jpg" },
    targetS3Object: { Bucket: "trust-sandbox", Name: "trust-face-lab/sandbox/liveness/reference.jpg" },
  });
  assert.equal(captured.kind, "compare");
  assert.equal(captured.input.SimilarityThreshold, 0);
  assert.equal(captured.input.QualityFilter, "NONE");
  assert.equal(result.Similarity, 92.4);
  assert.equal(result.MatchCount, 1);
  assert.equal(result.TargetFaceCount, 1);
});

test("compare faces rejects multiple target faces", async () => {
  const runtime = runtimeWith(async () => ({
    FaceMatches: [{ Similarity: 92.4 }, { Similarity: 88.1 }],
    UnmatchedFaces: [],
  }));
  await assert.rejects(
    runtime.compareFaces({
      sourceS3Object: { Bucket: "trust-sandbox", Name: "trust-face-lab/sandbox/authorized/reference.jpg" },
      targetS3Object: { Bucket: "trust-sandbox", Name: "trust-face-lab/sandbox/liveness/reference.jpg" },
    }),
    (error) => error.code === "multiple_target_faces_forbidden",
  );
});

test("compare faces rejects S3 references outside sandbox prefix before AWS call", async () => {
  let calls = 0;
  const runtime = runtimeWith(async () => { calls += 1; });
  await assert.rejects(
    runtime.compareFaces({
      sourceS3Object: { Bucket: "trust-sandbox", Name: "other-prefix/reference.jpg" },
      targetS3Object: { Bucket: "trust-sandbox", Name: "trust-face-lab/sandbox/liveness/reference.jpg" },
    }),
    (error) => error.code === "s3_prefix_outside_boundary",
  );
  assert.equal(calls, 0);
});
