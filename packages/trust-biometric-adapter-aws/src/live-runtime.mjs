const REGION = "sa-east-1";
const APPROVAL = "IGOR_APROVA_TRUST_AWS_SANDBOX_REAL";
const STATUSES = new Set(["CREATED","IN_PROGRESS","SUCCEEDED","FAILED","EXPIRED"]);

export class TrustAwsLiveRuntimeError extends Error {
  constructor(code, message) { super(message); this.name = "TrustAwsLiveRuntimeError"; this.code = code; }
}
function fail(code, message) { throw new TrustAwsLiveRuntimeError(code, message); }
function text(value, field) {
  if (typeof value !== "string" || !value.trim()) fail("invalid_live_input", `${field} must be a non-empty string`);
  return value.trim();
}
function s3Object(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("invalid_s3_reference", `${field} must be an S3 object reference`);
  if (Object.hasOwn(value, "Bytes")) fail("raw_biometric_material_forbidden", `${field}.Bytes is forbidden`);
  const Bucket = text(value.Bucket, `${field}.Bucket`);
  const Name = text(value.Name, `${field}.Name`);
  return value.Version ? { Bucket, Name, Version: text(value.Version, `${field}.Version`) } : { Bucket, Name };
}
function gate(env) {
  if (String(env.TRUST_AWS_LIVE_CALLS_ENABLED || "") !== "true") fail("live_calls_disabled", "live AWS calls are disabled");
  if (String(env.TRUST_AWS_CREDENTIALS_ALLOWED || "") !== "true") fail("credentials_not_authorized", "AWS credential use is not authorized");
  if (String(env.TRUST_AWS_SANDBOX_APPROVAL || "") !== APPROVAL) fail("sandbox_approval_mismatch", "explicit AWS sandbox approval is required");
  if (String(env.AWS_REGION || REGION) !== REGION) fail("region_mismatch", `AWS region must be ${REGION}`);
}
function boundary(env) {
  const bucket = text(env.TRUST_AWS_S3_BUCKET, "TRUST_AWS_S3_BUCKET");
  const prefix = text(env.TRUST_AWS_S3_PREFIX, "TRUST_AWS_S3_PREFIX").replace(/\/+$/u, "");
  if (!prefix) fail("s3_prefix_required", "TRUST_AWS_S3_PREFIX must not resolve to an empty prefix");
  return { bucket, prefix };
}
function s3Within(value, field, env) {
  const ref = s3Object(value, field);
  const b = boundary(env);
  if (ref.Bucket !== b.bucket) fail("s3_bucket_outside_boundary", `${field}.Bucket is outside the configured sandbox boundary`);
  if (ref.Name !== b.prefix && !ref.Name.startsWith(`${b.prefix}/`)) fail("s3_prefix_outside_boundary", `${field}.Name is outside the configured sandbox prefix`);
  return ref;
}
function outputConfig(value, env) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("output_config_required", "S3 output config is required");
  const b = boundary(env);
  const bucket = text(value.S3Bucket, "outputConfig.S3Bucket");
  const prefix = text(value.S3KeyPrefix, "outputConfig.S3KeyPrefix").replace(/\/+$/u, "");
  if (bucket !== b.bucket) fail("s3_bucket_outside_boundary", "outputConfig.S3Bucket is outside the configured sandbox boundary");
  if (prefix !== b.prefix && !prefix.startsWith(`${b.prefix}/`)) fail("s3_prefix_outside_boundary", "outputConfig.S3KeyPrefix is outside the configured sandbox prefix");
  return { bucket, prefix };
}
function clientOrFail(client) {
  if (!client || typeof client.send !== "function") fail("aws_client_required", "AWS Rekognition client is required");
  return client;
}
function livenessStatus(value) {
  const status = text(value, "Status");
  if (!STATUSES.has(status)) fail("invalid_liveness_status", `unsupported Face Liveness status: ${status}`);
  return status;
}
function confidence(value, status) {
  if (value == null && status !== "SUCCEEDED") return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    fail("invalid_liveness_confidence", "Face Liveness confidence must be a finite number between 0 and 100");
  }
  return value;
}

export function createAwsRekognitionLiveRuntime({ client, env = process.env, commands } = {}) {
  const aws = clientOrFail(client);
  if (!commands || typeof commands !== "object") fail("aws_commands_required", "AWS command constructors are required");
  const { CreateFaceLivenessSessionCommand, GetFaceLivenessSessionResultsCommand, CompareFacesCommand } = commands;
  if (![CreateFaceLivenessSessionCommand, GetFaceLivenessSessionResultsCommand, CompareFacesCommand].every((v) => typeof v === "function")) {
    fail("aws_commands_required", "required Rekognition commands are missing");
  }

  return Object.freeze({
    region: REGION,

    async createLivenessSession({ clientRequestToken, outputConfig: cfg } = {}) {
      gate(env);
      const token = text(clientRequestToken, "clientRequestToken");
      const { bucket, prefix } = outputConfig(cfg, env);
      const result = await aws.send(new CreateFaceLivenessSessionCommand({
        ClientRequestToken: token,
        Settings: { AuditImagesLimit: 0, OutputConfig: { S3Bucket: bucket, S3KeyPrefix: prefix } },
      }));
      return Object.freeze({
        SessionId: text(result?.SessionId, "SessionId"),
        region: REGION,
        auditImagesLimit: 0,
        output: { S3Bucket: bucket, S3KeyPrefix: prefix },
      });
    },

    async getLivenessResult({ sessionId } = {}) {
      gate(env);
      const id = text(sessionId, "sessionId");
      const result = await aws.send(new GetFaceLivenessSessionResultsCommand({ SessionId: id }));

      const returnedSessionId = text(result?.SessionId, "SessionId");
      if (returnedSessionId !== id) fail("session_id_mismatch", "Face Liveness result SessionId does not match the requested session");

      const auditImages = Array.isArray(result?.AuditImages) ? result.AuditImages : [];
      if (auditImages.length > 0) fail("audit_images_forbidden", "AuditImages must remain empty");
      if (result?.ReferenceImage && Object.hasOwn(result.ReferenceImage, "Bytes")) {
        fail("raw_biometric_material_forbidden", "ReferenceImage.Bytes is forbidden");
      }

      const status = livenessStatus(result?.Status);
      const score = confidence(result?.Confidence, status);
      const referenceS3 = result?.ReferenceImage?.S3Object
        ? s3Within(result.ReferenceImage.S3Object, "ReferenceImage.S3Object", env)
        : null;

      if (status === "SUCCEEDED" && !referenceS3) {
        fail("reference_image_s3_required", "SUCCEEDED Face Liveness result must provide an S3 reference image");
      }

      return Object.freeze({
        SessionId: id,
        Status: status,
        Confidence: score,
        ReferenceImage: referenceS3 ? { S3Object: referenceS3 } : null,
        AuditImages: [],
      });
    },

    async compareFaces({ sourceS3Object, targetS3Object } = {}) {
      gate(env);
      const source = s3Within(sourceS3Object, "sourceS3Object", env);
      const target = s3Within(targetS3Object, "targetS3Object", env);
      const result = await aws.send(new CompareFacesCommand({
        SourceImage: { S3Object: source },
        TargetImage: { S3Object: target },
        SimilarityThreshold: 0,
        QualityFilter: "NONE",
      }));

      const matches = Array.isArray(result?.FaceMatches) ? result.FaceMatches : [];
      const unmatched = Array.isArray(result?.UnmatchedFaces) ? result.UnmatchedFaces : [];
      const targetFaceCount = matches.length + unmatched.length;
      if (targetFaceCount > 1) fail("multiple_target_faces_forbidden", "CompareFaces target must contain exactly one visible face");

      const similarities = matches.map((m) => m?.Similarity).filter(
        (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100,
      );
      if (matches.length > 0 && similarities.length !== matches.length) {
        fail("invalid_face_match_similarity", "CompareFaces returned an invalid similarity score");
      }

      return Object.freeze({
        Similarity: similarities.length === 1 ? similarities[0] : 0,
        MatchCount: matches.length,
        TargetFaceCount: targetFaceCount,
      });
    },
  });
}
