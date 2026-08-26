import { createAwsRekognitionLiveRuntime } from "./global-trust-face-lab-live-runtime.mjs";

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

export function createGlobalTrustFaceLabLiveProvider({
  env = process.env,
  client = null,
  commands = null,
} = {}) {
  if (!enabled(env)) return null;
  if (!client || typeof client.send !== "function") return null;
  if (!commands || typeof commands !== "object") return null;

  return createAwsRekognitionLiveRuntime({
    client,
    env,
    commands,
  });
}
