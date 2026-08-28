import {
  shouldResolveGlobalTrustFaceLabAwsSdk,
  resolveGlobalTrustFaceLabAwsSdk,
} from "./global-trust-face-lab-aws-sdk-loader.mjs";
import { createGlobalTrustFaceLabLiveProvider } from "./global-trust-face-lab-live-provider.mjs";

export function shouldResolveGlobalTrustFaceLabLiveRuntime(env = process.env) {
  return shouldResolveGlobalTrustFaceLabAwsSdk(env);
}

export async function resolveGlobalTrustFaceLabLiveRuntime({
  env = process.env,
  sdkResolver = resolveGlobalTrustFaceLabAwsSdk,
  providerFactory = createGlobalTrustFaceLabLiveProvider,
} = {}) {
  if (!shouldResolveGlobalTrustFaceLabLiveRuntime(env)) return null;
  if (typeof sdkResolver !== "function") {
    throw new TypeError("sdkResolver must be a function");
  }
  if (typeof providerFactory !== "function") {
    throw new TypeError("providerFactory must be a function");
  }

  const sdk = await sdkResolver({ env });
  if (
    !sdk?.client ||
    !sdk?.commands ||
    !sdk?.s3Client ||
    !sdk?.s3Commands
  ) {
    const error = new Error(
      "Face Lab AWS SDK primitives are unavailable after live gates were enabled",
    );
    error.code = "TRUST_FACE_LAB_AWS_SDK_PRIMITIVES_UNAVAILABLE";
    throw error;
  }

  const runtime = providerFactory({
    env,
    client: sdk.client,
    commands: sdk.commands,
    s3Client: sdk.s3Client,
    s3Commands: sdk.s3Commands,
  });
  if (!runtime) {
    const error = new Error(
      "Face Lab live provider did not materialize after AWS SDK resolution",
    );
    error.code = "TRUST_FACE_LAB_LIVE_RUNTIME_UNAVAILABLE";
    throw error;
  }

  return runtime;
}
