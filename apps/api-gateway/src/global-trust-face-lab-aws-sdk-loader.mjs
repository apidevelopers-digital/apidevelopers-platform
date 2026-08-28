const APPROVAL = "IGOR_APROVA_TRUST_AWS_SANDBOX_REAL";
const REGION = "sa-east-1";

function liveBoundaryReady(env) {
  return (
    String(env?.TRUST_AWS_LIVE_CALLS_ENABLED ?? "") === "true" &&
    String(env?.TRUST_AWS_CREDENTIALS_ALLOWED ?? "") === "true" &&
    String(env?.TRUST_AWS_SANDBOX_APPROVAL ?? "") === APPROVAL &&
    String(env?.AWS_REGION ?? REGION) === REGION &&
    typeof env?.TRUST_AWS_S3_BUCKET === "string" &&
    env.TRUST_AWS_S3_BUCKET.trim().length > 0 &&
    typeof env?.TRUST_AWS_S3_PREFIX === "string" &&
    env.TRUST_AWS_S3_PREFIX.trim().length > 0
  );
}

function requireExport(module, name, sdkName) {
  const value = module?.[name];
  if (typeof value !== "function") {
    const error = new Error(`${sdkName} SDK export is unavailable: ${name}`);
    error.code = "TRUST_FACE_LAB_AWS_SDK_EXPORT_MISSING";
    throw error;
  }
  return value;
}

export function shouldResolveGlobalTrustFaceLabAwsSdk(env = process.env) {
  return liveBoundaryReady(env);
}

export async function resolveGlobalTrustFaceLabAwsSdk({
  env = process.env,
  sdkLoader = () => import("@aws-sdk/client-rekognition"),
  s3SdkLoader = () => import("@aws-sdk/client-s3"),
} = {}) {
  if (!liveBoundaryReady(env)) return null;
  if (typeof sdkLoader !== "function") {
    throw new TypeError("sdkLoader must be a function");
  }
  if (typeof s3SdkLoader !== "function") {
    throw new TypeError("s3SdkLoader must be a function");
  }

  let rekognitionSdk;
  let s3Sdk;
  try {
    [rekognitionSdk, s3Sdk] = await Promise.all([sdkLoader(), s3SdkLoader()]);
  } catch (cause) {
    const error = new Error("AWS SDKs are not materialized in this runtime");
    error.code = "TRUST_FACE_LAB_AWS_SDK_UNAVAILABLE";
    error.cause = cause;
    throw error;
  }

  const RekognitionClient = requireExport(rekognitionSdk, "RekognitionClient", "Rekognition");
  const CreateFaceLivenessSessionCommand = requireExport(
    rekognitionSdk,
    "CreateFaceLivenessSessionCommand",
    "Rekognition",
  );
  const GetFaceLivenessSessionResultsCommand = requireExport(
    rekognitionSdk,
    "GetFaceLivenessSessionResultsCommand",
    "Rekognition",
  );
  const CompareFacesCommand = requireExport(rekognitionSdk, "CompareFacesCommand", "Rekognition");

  const S3Client = requireExport(s3Sdk, "S3Client", "S3");
  const PutObjectCommand = requireExport(s3Sdk, "PutObjectCommand", "S3");
  const DeleteObjectCommand = requireExport(s3Sdk, "DeleteObjectCommand", "S3");

  const client = new RekognitionClient({ region: REGION });
  const s3Client = new S3Client({ region: REGION });

  return Object.freeze({
    client,
    commands: Object.freeze({
      CreateFaceLivenessSessionCommand,
      GetFaceLivenessSessionResultsCommand,
      CompareFacesCommand,
    }),
    s3Client,
    s3Commands: Object.freeze({
      PutObjectCommand,
      DeleteObjectCommand,
    }),
    descriptor: Object.freeze({
      provider: "aws-rekognition",
      region: REGION,
      sdk: "@aws-sdk/client-rekognition",
      s3Sdk: "@aws-sdk/client-s3",
      networkCalled: false,
      credentialsResolved: false,
    }),
  });
}
