import { createGlobalTrustFaceLabAwsSigV4Primitives } from "./global-trust-face-lab-aws-sigv4-transport.mjs";

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

function requiredObject(value, field) {
  if (!value || typeof value !== "object") {
    const error = new Error(`Face Lab native AWS primitive is unavailable: ${field}`);
    error.code = "TRUST_FACE_LAB_AWS_PRIMITIVE_MISSING";
    throw error;
  }
  return value;
}

export function shouldResolveGlobalTrustFaceLabAwsSdk(env = process.env) {
  return liveBoundaryReady(env);
}

export async function resolveGlobalTrustFaceLabAwsSdk({
  env = process.env,
  transportFactory = createGlobalTrustFaceLabAwsSigV4Primitives,
} = {}) {
  if (!liveBoundaryReady(env)) return null;
  if (typeof transportFactory !== "function") {
    throw new TypeError("transportFactory must be a function");
  }

  let primitives;
  try {
    primitives = transportFactory({ env, region: REGION });
  } catch (cause) {
    const error = new Error("Face Lab native AWS transport could not be materialized");
    error.code = "TRUST_FACE_LAB_AWS_TRANSPORT_UNAVAILABLE";
    error.cause = cause;
    throw error;
  }

  requiredObject(primitives, "primitives");
  const client = requiredObject(primitives.client, "client");
  const commands = requiredObject(primitives.commands, "commands");
  const s3Client = requiredObject(primitives.s3Client, "s3Client");
  const s3Commands = requiredObject(primitives.s3Commands, "s3Commands");

  if (typeof client.send !== "function" || typeof s3Client.send !== "function") {
    const error = new Error("Face Lab native AWS clients must expose send(command)");
    error.code = "TRUST_FACE_LAB_AWS_PRIMITIVE_MISSING";
    throw error;
  }

  return Object.freeze({
    client,
    commands,
    s3Client,
    s3Commands,
    descriptor: Object.freeze({
      provider: "aws-sigv4-native",
      region: REGION,
      transport: "node-native",
      networkCalled: false,
      credentialsResolved: false,
    }),
  });
}
