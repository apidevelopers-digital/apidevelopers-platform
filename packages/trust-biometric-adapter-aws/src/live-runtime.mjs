const REGION = "sa-east-1";
const APPROVAL = "IGOR_APROVA_TRUST_AWS_SANDBOX_REAL";

export class TrustAwsLiveRuntimeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TrustAwsLiveRuntimeError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new TrustAwsLiveRuntimeError(code, message);
}

function text(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    fail("invalid_live_input", `${field} must be a non-empty string`);
  }
  return value.trim();
}

function s3Object(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_s3_reference", `${field} must be an S3 object reference`);
  }
  if (Object.hasOwn(value, "Bytes")) {
    fail("raw_biometric_material_forbidden", `${field}.Bytes is forbidden`);
  }

  const Bucket = text(value.Bucket, `${field}.Bucket`);
  const Name = text(value.Name, `${field}.Name`);
  return value.Version
    ? { Bucket, Name, Version: text(value.Version, `${field}.Version`) }
    : { Bucket, Name };
}

function assertLiveGate(env) {
  if (String(env.TRUST_AWS_LIVE_CALLS_ENABLED || "") !== "true") {
    fail("live_calls_disabled", "live AWS calls are disabled");
  }
  if (String(env.TRUST_AWS_CREDENTIALS_ALLOWED || "") !== "true") {
    fail("credentials_not_authorized", "AWS credential use is not authorized");
  }
  if (String(env.TRUST_AWS_SANDBOX_APPROVAL || "") !== APPROVAL) {
    fail("sandbox_approval_mismatch", "explicit AWS sandbox approval is required");
  }
  if (String(env.AWS_REGION || REGION) !== REGION) {
    fail("region_mismatch", `AWS region must be ${REGION}`);
  }
}

function assertClient(client) {
  if (!client || typeof client.send !== "function") {
    fail("aws_client_required", "AWS Rekognition client is required");
  }
  return client;
}

export function createAwsRekognitionLiveRuntime({
  client,
  env = process.env,
  commands,
} = {}) {
  const aws = assertClient(client);
  if (!commands || typeof commands !== "object") {
    fail("aws_commands_required", "AWS command constructors are required");
  }

  const {
    CreateFaceLivenessSessionCommand,
    GetFaceLivenessSessionResultsCommand,
    CompareFacesCommand,
  } = commands;

  if (
    ![
      CreateFaceLivenessSessionCommand,
      GetFaceLivenessSessionResultsCommand,
      CompareFacesCommand,
    ].every((value) => typeof value === "function")
  ) {
    fail("aws_commands_required", "required Rekognition commands are missing");
  }

  const gate = () => assertLiveGate(env);

  return Object.freeze({
    region: REGION,

    async createLivenessSession({ clientRequestToken, outputConfig } = {}) {
      gate();
      const token = text(clientRequestToken, "clientRequestToken");
      if (!outputConfig || typeof outputConfig !== "object") {
        fail("output_config_required", "S3 output config is required");
      }

      const bucket = text(outputConfig.S3Bucket, "outputConfig.S3Bucket");
      const prefix = text(outputConfig.S3KeyPrefix, "outputConfig.S3KeyPrefix");

      const result = await aws.send(
        new CreateFaceLivenessSessionCommand({
          ClientRequestToken: token,
          Settings: {
            AuditImagesLimit: 0,
            OutputConfig: {
              S3Bucket: bucket,
              S3KeyPrefix: prefix,
            },
          },
        }),
      );

      return Object.freeze({
        SessionId: text(result?.SessionId, "SessionId"),
        region: REGION,
        auditImagesLimit: 0,
        output: {
          S3Bucket: bucket,
          S3KeyPrefix: prefix,
        },
      });
    },

    async getLivenessResult({ sessionId } = {}) {
      gate();
      const id = text(sessionId, "sessionId");
      const result = await aws.send(
        new GetFaceLivenessSessionResultsCommand({ SessionId: id }),
      );

      const auditImages = Array.isArray(result?.AuditImages)
        ? result.AuditImages
        : [];
      if (auditImages.length > 0) {
        fail("audit_images_forbidden", "AuditImages must remain empty");
      }

      const referenceS3 = result?.ReferenceImage?.S3Object
        ? s3Object(result.ReferenceImage.S3Object, "ReferenceImage.S3Object")
        : null;

      return Object.freeze({
        SessionId: id,
        Status: text(result?.Status, "Status"),
        Confidence:
          typeof result?.Confidence === "number" && Number.isFinite(result.Confidence)
            ? result.Confidence
            : null,
        ReferenceImage: referenceS3 ? { S3Object: referenceS3 } : null,
        AuditImages: [],
      });
    },

    async compareFaces({ sourceS3Object, targetS3Object } = {}) {
      gate();
      const source = s3Object(sourceS3Object, "sourceS3Object");
      const target = s3Object(targetS3Object, "targetS3Object");

      const result = await aws.send(
        new CompareFacesCommand({
          SourceImage: { S3Object: source },
          TargetImage: { S3Object: target },
          SimilarityThreshold: 0,
          QualityFilter: "NONE",
        }),
      );

      const matches = Array.isArray(result?.FaceMatches)
        ? result.FaceMatches
        : [];
      const maxSimilarity = matches.reduce(
        (max, match) =>
          Math.max(
            max,
            typeof match?.Similarity === "number" &&
              Number.isFinite(match.Similarity)
              ? match.Similarity
              : 0,
          ),
        0,
      );

      return Object.freeze({
        Similarity: maxSimilarity,
        MatchCount: matches.length,
      });
    },
  });
}
