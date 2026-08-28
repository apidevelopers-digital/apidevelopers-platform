import { createAwsRekognitionLiveRuntime } from "./global-trust-face-lab-live-runtime.mjs";
import { createGlobalTrustFaceLabEphemeralS3Lifecycle } from "./global-trust-face-lab-ephemeral-s3-lifecycle.mjs";

const APPROVAL = "IGOR_APROVA_TRUST_AWS_SANDBOX_REAL";
const REGION = "sa-east-1";

function enabled(env) {
  return (
    String(env.TRUST_AWS_LIVE_CALLS_ENABLED ?? "") === "true" &&
    String(env.TRUST_AWS_CREDENTIALS_ALLOWED ?? "") === "true" &&
    String(env.TRUST_AWS_SANDBOX_APPROVAL ?? "") === APPROVAL &&
    String(env.AWS_REGION ?? REGION) === REGION &&
    typeof env.TRUST_AWS_S3_BUCKET === "string" &&
    env.TRUST_AWS_S3_BUCKET.trim().length > 0 &&
    typeof env.TRUST_AWS_S3_PREFIX === "string" &&
    env.TRUST_AWS_S3_PREFIX.trim().length > 0
  );
}

function boundary(env) {
  const bucket = String(env.TRUST_AWS_S3_BUCKET ?? "").trim();
  const prefix = String(env.TRUST_AWS_S3_PREFIX ?? "").trim().replace(/\/+$/u, "");
  if (!bucket || !prefix) {
    const error = new Error("configured S3 boundary is required");
    error.code = "TRUST_FACE_LAB_S3_BOUNDARY_REQUIRED";
    throw error;
  }
  return { bucket, prefix };
}

function withinBoundary({ bucket, key }, env) {
  const configured = boundary(env);
  if (bucket !== configured.bucket) {
    const error = new Error("S3 bucket is outside configured Trust sandbox boundary");
    error.code = "TRUST_FACE_LAB_S3_BUCKET_OUTSIDE_BOUNDARY";
    throw error;
  }
  if (key !== configured.prefix && !key.startsWith(`${configured.prefix}/`)) {
    const error = new Error("S3 key is outside configured Trust sandbox prefix");
    error.code = "TRUST_FACE_LAB_S3_PREFIX_OUTSIDE_BOUNDARY";
    throw error;
  }
  return { bucket, key };
}

export function createGlobalTrustFaceLabLiveProvider({
  env = process.env,
  client = null,
  commands = null,
  s3Client = null,
  s3Commands = null,
} = {}) {
  if (!enabled(env)) return null;
  if (!client || typeof client.send !== "function") return null;
  if (!commands || typeof commands !== "object") return null;

  const runtime = createAwsRekognitionLiveRuntime({
    client,
    env,
    commands,
  });

  if (
    !s3Client ||
    typeof s3Client.send !== "function" ||
    !s3Commands ||
    typeof s3Commands.PutObjectCommand !== "function" ||
    typeof s3Commands.DeleteObjectCommand !== "function"
  ) {
    return runtime;
  }

  const lifecycle = createGlobalTrustFaceLabEphemeralS3Lifecycle({
    s3Client,
    PutObjectCommand: s3Commands.PutObjectCommand,
    DeleteObjectCommand: s3Commands.DeleteObjectCommand,
    compareFaces: async ({ source, target, similarityThreshold }) =>
      runtime.compareFaces({
        sourceS3Object: { Bucket: source.bucket, Name: source.key },
        targetS3Object: { Bucket: target.bucket, Name: target.key },
        similarityThreshold,
      }),
  });

  return Object.freeze({
    ...runtime,
    async compareEphemeralReference({
      referenceKey,
      referenceBytes,
      contentType = "image/jpeg",
      targetS3Object,
      similarityThreshold,
    } = {}) {
      const configured = boundary(env);
      const reference = withinBoundary(
        {
          bucket: configured.bucket,
          key: String(referenceKey ?? "").trim(),
        },
        env,
      );

      if (!(referenceBytes instanceof Uint8Array)) {
        const error = new TypeError("referenceBytes must be Uint8Array");
        error.code = "TRUST_FACE_LAB_REFERENCE_BYTES_REQUIRED";
        throw error;
      }

      if (!targetS3Object || typeof targetS3Object !== "object") {
        const error = new TypeError("targetS3Object is required");
        error.code = "TRUST_FACE_LAB_TARGET_S3_REQUIRED";
        throw error;
      }
      const target = withinBoundary(
        {
          bucket: String(targetS3Object.Bucket ?? "").trim(),
          key: String(targetS3Object.Name ?? "").trim(),
        },
        env,
      );

      return lifecycle.compareEphemeralReference({
        bucket: reference.bucket,
        key: reference.key,
        body: referenceBytes,
        contentType,
        target,
        similarityThreshold,
      });
    },
  });
}
