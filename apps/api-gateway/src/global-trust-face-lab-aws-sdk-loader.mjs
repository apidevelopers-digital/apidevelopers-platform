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

function requireExport(module, name) {
  const value = module?.[name];
  if (typeof value !== "function") {
    const error = new Error(`AWS Rekognition SDK export is unavailable: ${name}`);
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
} = {}) {
  if (!liveBoundaryReady(env)) return null;
  if (typeof sdkLoader !== "function") {
    throw new TypeError("sdkLoader must be a function");
  }

  let sdk;
  try {
    sdk = await sdkLoader();
  } catch (cause) {
    const error = new Error("AWS Rekognition SDK is not materialized in this runtime");
    error.code = "TRUST_FACE_LAB_AWS_SDK_UNAVAILABLE";
    error.cause = cause;
    throw error;
  }

  const RekognitionClient = requireExport(sdk, "RekognitionClient");
  const CreateFaceLivenessSessionCommand = requireExport(sdk, "CreateFaceLivenessSessionCommand");
  const GetFaceLivenessSessionResultsCommand = requireExport(sdk, "GetFaceLivenessSessionResultsCommand");
  const CompareFacesCommand = requireExport(sdk, "CompareFacesCommand");

  const client = new RekognitionClient({ region: REGION });
  return Object.freeze({
    client,
    commands: Object.freeze({
      CreateFaceLivenessSessionCommand,
      GetFaceLivenessSessionResultsCommand,
      CompareFacesCommand,
    }),
    descriptor: Object.freeze({
      provider: "aws-rekognition",
      region: REGION,
      sdk: "@aws-sdk/client-rekognition",
      networkCalled: false,
      credentialsResolved: false,
    }),
  });
}
